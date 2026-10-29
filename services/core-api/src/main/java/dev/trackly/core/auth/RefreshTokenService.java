package dev.trackly.core.auth;

import dev.trackly.core.common.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Refresh-token rotation with re-use detection.
 *
 * <ul>
 *   <li>Tokens are 256-bit random strings; only their SHA-256 hash is stored.</li>
 *   <li>Every refresh revokes the presented token and issues a new one in the same "family".</li>
 *   <li>If an already-revoked token is presented again, someone replayed a stolen token:
 *       the whole family is revoked, logging out both the thief and the victim.</li>
 *   <li>Exception: a token rotated only seconds ago whose replacement was never used is a lost
 *       response (the page reloaded mid-request, a mobile network dropped), not theft. It gets a
 *       fresh token in the same family instead of logging the user out. See {@link #REUSE_GRACE}.</li>
 * </ul>
 */
@Service
public class RefreshTokenService {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * How long a just-rotated token may be presented again without counting as theft. Short on
     * purpose: long enough to cover a reload or retry, too short to be a useful theft window.
     */
    static final Duration REUSE_GRACE = Duration.ofSeconds(20);

    /** Raw token (sent to the client exactly once) plus the row that stores its hash. */
    public record Issued(String rawToken, RefreshToken token) {}

    private final RefreshTokenRepository repository;
    private final Clock clock;
    private final Duration ttl;

    public RefreshTokenService(RefreshTokenRepository repository, Clock clock,
                               dev.trackly.core.config.AppProperties props) {
        this.repository = repository;
        this.clock = clock;
        this.ttl = props.jwt().refreshTtl();
    }

    public Duration ttl() {
        return ttl;
    }

    @Transactional
    public Issued issueNewFamily(UUID userId, String userAgent) {
        return issue(userId, UUID.randomUUID(), userAgent);
    }

    /** Validates and rotates a token. Returns the replacement. */
    @Transactional(noRollbackFor = ApiException.class)
    public Issued rotate(String rawToken, String userAgent) {
        RefreshToken current = repository.findByTokenHash(hash(rawToken))
                .orElseThrow(() -> ApiException.unauthorized("INVALID_REFRESH_TOKEN", "Session expired, please sign in"));
        Instant now = clock.instant();

        if (current.isRevoked()) {
            if (isLostResponse(current, now)) {
                return issue(current.getUserId(), current.getFamilyId(), userAgent);
            }
            // Re-use of a rotated token => likely theft. Kill the entire chain.
            int revoked = repository.revokeFamily(current.getFamilyId(), now);
            log.warn("Refresh token re-use detected for user {} - revoked {} tokens", current.getUserId(), revoked);
            throw ApiException.unauthorized("REFRESH_TOKEN_REUSED", "Session expired, please sign in");
        }
        if (current.getExpiresAt().isBefore(now)) {
            throw ApiException.unauthorized("INVALID_REFRESH_TOKEN", "Session expired, please sign in");
        }

        Issued next = issue(current.getUserId(), current.getFamilyId(), userAgent);
        current.revoke(now, next.token().getId());
        return next;
    }

    /**
     * True when {@code used} was rotated (not logged out or revoked for theft) within the grace
     * window and its replacement hasn't been used yet, i.e. the client most likely never received
     * the replacement. Once the chain has moved on, presenting an old token is treated as theft.
     */
    private boolean isLostResponse(RefreshToken used, Instant now) {
        if (used.getReplacedBy() == null || used.getRevokedAt().isBefore(now.minus(REUSE_GRACE))) {
            return false;
        }
        return repository.findById(used.getReplacedBy()).map(next -> !next.isRevoked()).orElse(false);
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public void revokeFamilyOf(String rawToken) {
        repository.findByTokenHash(hash(rawToken))
                .ifPresent(t -> repository.revokeFamily(t.getFamilyId(), clock.instant()));
    }

    @Transactional
    @Scheduled(initialDelayString = "PT15M", fixedDelayString = "PT12H")
    public void purgeExpired() {
        repository.deleteExpired(clock.instant().minus(Duration.ofDays(1)));
    }

    private Issued issue(UUID userId, UUID familyId, String userAgent) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant now = clock.instant();
        String agent = userAgent == null ? null : userAgent.substring(0, Math.min(255, userAgent.length()));
        RefreshToken token = new RefreshToken(userId, familyId, hash(raw), now.plus(ttl), agent, now);
        repository.save(token);
        return new Issued(raw, token);
    }

    static String hash(String raw) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
