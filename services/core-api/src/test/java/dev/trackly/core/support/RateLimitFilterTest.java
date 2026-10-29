package dev.trackly.core.support;

import static org.assertj.core.api.Assertions.assertThat;

import dev.trackly.core.security.RateLimitFilter;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RateLimitFilterTest {

    /** A clock we can move forward by hand. */
    private static final class MutableClock extends Clock {
        final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-10-29T10:00:00Z"));

        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return now.get(); }
    }

    private static int login(RateLimitFilter filter, String ip) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/auth/login");
        req.setRemoteAddr(ip);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, new MockFilterChain());
        return res.getStatus();
    }

    @Test
    void blocksTheEleventhLoginAttemptInAMinuteAndRecoversAfterTheWindow() throws Exception {
        MutableClock clock = new MutableClock();
        RateLimitFilter filter = new RateLimitFilter(clock);

        for (int i = 0; i < 10; i++) {
            assertThat(login(filter, "1.2.3.4")).isEqualTo(200);
        }
        assertThat(login(filter, "1.2.3.4")).isEqualTo(429);
        // Other clients are unaffected.
        assertThat(login(filter, "5.6.7.8")).isEqualTo(200);

        clock.now.set(clock.now.get().plus(Duration.ofSeconds(61)));
        assertThat(login(filter, "1.2.3.4")).isEqualTo(200);
    }

    @Test
    void ignoresOtherEndpoints() throws Exception {
        RateLimitFilter filter = new RateLimitFilter(new MutableClock());
        for (int i = 0; i < 50; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/tasks");
            MockHttpServletResponse res = new MockHttpServletResponse();
            filter.doFilter(req, res, new MockFilterChain());
            assertThat(res.getStatus()).isEqualTo(200);
        }
    }
}
