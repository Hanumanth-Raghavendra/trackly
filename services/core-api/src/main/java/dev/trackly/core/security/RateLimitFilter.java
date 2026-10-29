package dev.trackly.core.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Fixed-window rate limiter for the unauthenticated auth endpoints (brute-force protection).
 *
 * <p>In-memory is deliberate: a single free instance needs no Redis. With several instances you
 * would move the counters to a shared store (e.g. Redis INCR + EXPIRE) — the interface stays the same.
 */
public class RateLimitFilter extends OncePerRequestFilter {

    record Rule(String method, String path, int limit, Duration window) {}

    private static final class Window {
        final long startMillis;
        int count;

        Window(long startMillis) {
            this.startMillis = startMillis;
        }
    }

    static final Rule[] RULES = {
        new Rule("POST", "/api/v1/auth/login", 10, Duration.ofMinutes(1)),
        new Rule("POST", "/api/v1/auth/register", 5, Duration.ofMinutes(10)),
        new Rule("POST", "/api/v1/auth/demo", 10, Duration.ofHours(1)),
        new Rule("POST", "/api/v1/auth/refresh", 60, Duration.ofMinutes(1)),
    };

    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final Clock clock;

    public RateLimitFilter(Clock clock) {
        this.clock = clock;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Rule rule = match(request);
        if (rule != null) {
            long retryAfter = tryAcquire(rule.path() + "|" + request.getRemoteAddr(), rule);
            if (retryAfter > 0) {
                response.setStatus(429);
                response.setHeader("Retry-After", Long.toString(retryAfter));
                response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                response.getWriter().write("""
                        {"type":"https://trackly.dev/problems/rate-limited","title":"Too Many Requests",\
                        "status":429,"detail":"Too many attempts. Try again in %d seconds.","code":"RATE_LIMITED"}"""
                        .formatted(retryAfter));
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private static Rule match(HttpServletRequest request) {
        for (Rule rule : RULES) {
            if (rule.method().equals(request.getMethod()) && rule.path().equals(request.getRequestURI())) {
                return rule;
            }
        }
        return null;
    }

    /** @return 0 when allowed, otherwise seconds until the window resets. */
    long tryAcquire(String key, Rule rule) {
        long now = clock.millis();
        long windowMillis = rule.window().toMillis();
        if (windows.size() > 10_000) {
            windows.entrySet().removeIf(e -> now - e.getValue().startMillis > Duration.ofHours(1).toMillis());
        }
        Window window = windows.compute(key, (k, w) -> (w == null || now - w.startMillis >= windowMillis) ? new Window(now) : w);
        synchronized (window) {
            if (window.count < rule.limit()) {
                window.count++;
                return 0;
            }
            return Math.max(1, (window.startMillis + windowMillis - now) / 1000);
        }
    }
}
