package dev.trackly.core.auth;

import dev.trackly.core.common.ApiException;
import dev.trackly.core.common.Zones;
import dev.trackly.core.demo.DemoSeeder;
import dev.trackly.core.outbox.EventTypes;
import dev.trackly.core.outbox.OutboxPublisher;
import dev.trackly.core.security.JwtService;
import dev.trackly.core.user.User;
import dev.trackly.core.user.UserEvents;
import dev.trackly.core.user.UserRepository;
import java.time.Clock;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    /** Result of any successful sign-in: a fresh access token plus a rotated refresh token. */
    public record Session(User user, String accessToken, String refreshToken) {}

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokens;
    private final OutboxPublisher outbox;
    private final DemoSeeder demoSeeder;
    private final Clock clock;
    private final String dummyHash;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, JwtService jwtService,
                       RefreshTokenService refreshTokens, OutboxPublisher outbox, DemoSeeder demoSeeder, Clock clock) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.refreshTokens = refreshTokens;
        this.outbox = outbox;
        this.demoSeeder = demoSeeder;
        this.clock = clock;
        // Used to keep login timing similar whether or not the email exists (user enumeration).
        this.dummyHash = passwordEncoder.encode("not-a-real-password");
    }

    @Transactional
    public Session register(AuthDtos.RegisterRequest req, String userAgent) {
        String email = req.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("EMAIL_TAKEN", "An account with this email already exists");
        }
        User user = new User(email, passwordEncoder.encode(req.password()), req.displayName().trim(),
                Zones.normalize(req.timezone()));
        users.save(user);
        outbox.publish(user.getId(), EventTypes.USER, user.getId(), EventTypes.USER_REGISTERED,
                UserEvents.snapshot(user), clock.instant());
        return startSession(user, userAgent);
    }

    @Transactional
    public Session login(AuthDtos.LoginRequest req, String userAgent) {
        User user = users.findByEmailIgnoreCase(req.email().trim()).orElse(null);
        String hash = user == null ? dummyHash : user.getPasswordHash();
        boolean ok = passwordEncoder.matches(req.password(), hash);
        if (user == null || !ok) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Email or password is incorrect");
        }
        return startSession(user, userAgent);
    }

    @Transactional(noRollbackFor = ApiException.class)
    public Session refresh(String rawRefreshToken, String userAgent) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
            throw ApiException.unauthorized("NO_REFRESH_TOKEN", "Session expired, please sign in");
        }
        RefreshTokenService.Issued next = refreshTokens.rotate(rawRefreshToken, userAgent);
        User user = users.findById(next.token().getUserId())
                .orElseThrow(() -> ApiException.unauthorized("INVALID_REFRESH_TOKEN", "Session expired, please sign in"));
        return new Session(user, jwtService.issueAccessToken(user), next.rawToken());
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        if (rawRefreshToken != null && !rawRefreshToken.isBlank()) {
            refreshTokens.revokeFamilyOf(rawRefreshToken);
        }
    }

    /** Creates a throw-away account pre-filled with ~8 weeks of realistic data. */
    @Transactional
    public Session startDemo(String timezone, String userAgent) {
        User user = demoSeeder.createDemoUser(Zones.normalize(timezone));
        return startSession(user, userAgent);
    }

    private Session startSession(User user, String userAgent) {
        RefreshTokenService.Issued refresh = refreshTokens.issueNewFamily(user.getId(), userAgent);
        return new Session(user, jwtService.issueAccessToken(user), refresh.rawToken());
    }
}
