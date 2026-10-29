package dev.trackly.core.auth;

import dev.trackly.core.common.ApiException;
import dev.trackly.core.config.AppProperties;
import dev.trackly.core.security.JwtService;
import dev.trackly.core.user.UserDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Authentication endpoints.
 *
 * <p>Two client modes share one API:
 * <ul>
 *   <li><b>Browser</b>: the refresh token lives in an httpOnly, SameSite=Strict cookie scoped to
 *       {@code /api/v1/auth}. The web app calls the API same-origin (Vercel rewrites), so the cookie
 *       is first-party and JavaScript can never read it.</li>
 *   <li><b>Native app</b> ({@code X-Client: native}): the refresh token is returned in the body and
 *       stored in the device's secure storage, because cookies don't work well across the
 *       {@code https://localhost} origin a Capacitor app runs on.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Auth")
public class AuthController {

    static final String COOKIE = "trackly_rt";
    private static final String COOKIE_PATH = "/api/v1/auth";

    private final AuthService authService;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokens;
    private final AppProperties props;

    public AuthController(AuthService authService, JwtService jwtService, RefreshTokenService refreshTokens,
                          AppProperties props) {
        this.authService = authService;
        this.jwtService = jwtService;
        this.refreshTokens = refreshTokens;
        this.props = props;
    }

    @PostMapping("/register")
    @Operation(summary = "Create an account")
    public ResponseEntity<AuthDtos.AuthResponse> register(@Valid @RequestBody AuthDtos.RegisterRequest req,
                                                          HttpServletRequest http) {
        return respond(HttpStatus.CREATED, authService.register(req, userAgent(http)), http);
    }

    @PostMapping("/login")
    @Operation(summary = "Sign in with email and password")
    public ResponseEntity<AuthDtos.AuthResponse> login(@Valid @RequestBody AuthDtos.LoginRequest req,
                                                       HttpServletRequest http) {
        return respond(HttpStatus.OK, authService.login(req, userAgent(http)), http);
    }

    @PostMapping("/refresh")
    @Operation(summary = "Rotate the refresh token and get a new access token")
    public ResponseEntity<AuthDtos.AuthResponse> refresh(
            @CookieValue(name = COOKIE, required = false) String cookieToken,
            @RequestBody(required = false) AuthDtos.RefreshRequest body,
            HttpServletRequest http) {
        String token = cookieToken != null ? cookieToken : (body == null ? null : body.refreshToken());
        try {
            return respond(HttpStatus.OK, authService.refresh(token, userAgent(http)), http);
        } catch (ApiException e) {
            // Clear a dead cookie so the browser stops sending it.
            return ResponseEntity.status(e.status())
                    .header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString())
                    .build();
        }
    }

    @PostMapping("/logout")
    @Operation(summary = "Revoke the current session")
    public ResponseEntity<Void> logout(@CookieValue(name = COOKIE, required = false) String cookieToken,
                                       @RequestBody(required = false) AuthDtos.RefreshRequest body) {
        authService.logout(cookieToken != null ? cookieToken : (body == null ? null : body.refreshToken()));
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString())
                .build();
    }

    @PostMapping("/demo")
    @Operation(summary = "Start a 24-hour demo account pre-filled with realistic data")
    public ResponseEntity<AuthDtos.AuthResponse> demo(@RequestBody(required = false) AuthDtos.DemoRequest req,
                                                      HttpServletRequest http) {
        if (!props.demo().enabled()) {
            throw ApiException.forbidden("DEMO_DISABLED", "Demo accounts are disabled");
        }
        String tz = req == null ? null : req.timezone();
        return respond(HttpStatus.CREATED, authService.startDemo(tz, userAgent(http)), http);
    }

    private ResponseEntity<AuthDtos.AuthResponse> respond(HttpStatus status, AuthService.Session session,
                                                          HttpServletRequest http) {
        boolean nativeClient = "native".equalsIgnoreCase(http.getHeader("X-Client"));
        var body = new AuthDtos.AuthResponse(
                session.accessToken(),
                jwtService.accessTtl().toSeconds(),
                UserDto.from(session.user()),
                nativeClient ? session.refreshToken() : null);
        var builder = ResponseEntity.status(status);
        if (!nativeClient) {
            builder.header(HttpHeaders.SET_COOKIE, cookie(session.refreshToken(), refreshTokens.ttl()).toString());
        }
        return builder.body(body);
    }

    private ResponseCookie cookie(String value, Duration maxAge) {
        return ResponseCookie.from(COOKIE, value)
                .httpOnly(true)
                .secure(props.cookie().secure())
                .sameSite(props.cookie().sameSite())
                .path(COOKIE_PATH)
                .maxAge(maxAge)
                .build();
    }

    private static String userAgent(HttpServletRequest http) {
        return http.getHeader(HttpHeaders.USER_AGENT);
    }
}
