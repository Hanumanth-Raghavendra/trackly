package dev.trackly.core.security;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSSigner;
import com.nimbusds.jose.JWSVerifier;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import dev.trackly.core.config.AppProperties;
import dev.trackly.core.user.User;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Issues and verifies short-lived HS256 access tokens.
 *
 * <p>The same secret is configured on the insights service, so it can authenticate users
 * without calling this service. Refresh tokens are NOT JWTs; see {@code RefreshTokenService}.
 */
@Service
public class JwtService {

    public static final String AUDIENCE = "trackly";
    private static final JOSEObjectType ACCESS_TYPE = new JOSEObjectType("at+jwt");

    private final JWSSigner signer;
    private final JWSVerifier verifier;
    private final String issuer;
    private final Duration accessTtl;
    private final Clock clock;

    public JwtService(AppProperties props, Clock clock) {
        byte[] secret = props.jwt().secret().getBytes(StandardCharsets.UTF_8);
        if (secret.length < 32) {
            throw new IllegalStateException("JWT_SECRET must be at least 32 characters long");
        }
        try {
            this.signer = new MACSigner(secret);
            this.verifier = new MACVerifier(secret);
        } catch (JOSEException e) {
            throw new IllegalStateException("Invalid JWT secret", e);
        }
        this.issuer = props.jwt().issuer();
        this.accessTtl = props.jwt().accessTtl();
        this.clock = clock;
    }

    public Duration accessTtl() {
        return accessTtl;
    }

    public String issueAccessToken(User user) {
        Instant now = clock.instant();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(user.getId().toString())
                .issuer(issuer)
                .audience(AUDIENCE)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(accessTtl)))
                .jwtID(UUID.randomUUID().toString())
                .claim("email", user.getEmail())
                .claim("name", user.getDisplayName())
                .claim("tz", user.getTimezone())
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256).type(ACCESS_TYPE).build(), claims);
        try {
            jwt.sign(signer);
        } catch (JOSEException e) {
            throw new IllegalStateException("Could not sign access token", e);
        }
        return jwt.serialize();
    }

    /** Returns the user encoded in a valid, unexpired token issued by us; empty otherwise. */
    public Optional<AuthUser> verify(String token) {
        try {
            SignedJWT jwt = SignedJWT.parse(token);
            if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm()) || !jwt.verify(verifier)) {
                return Optional.empty();
            }
            JWTClaimsSet claims = jwt.getJWTClaimsSet();
            Date exp = claims.getExpirationTime();
            List<String> audience = claims.getAudience();
            if (exp == null || exp.toInstant().isBefore(clock.instant())
                    || !issuer.equals(claims.getIssuer())
                    || audience == null || !audience.contains(AUDIENCE)) {
                return Optional.empty();
            }
            return Optional.of(new AuthUser(
                    UUID.fromString(claims.getSubject()),
                    claims.getStringClaim("email"),
                    claims.getStringClaim("name"),
                    claims.getStringClaim("tz")));
        } catch (ParseException | JOSEException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
