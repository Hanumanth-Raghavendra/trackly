package dev.trackly.core.common;

import java.time.ZoneId;

public final class Zones {

    private Zones() {}

    /** Returns the IANA zone id if valid, otherwise UTC. Browsers send e.g. "Asia/Kolkata". */
    public static String normalize(String timezone) {
        if (timezone == null || timezone.isBlank()) {
            return "UTC";
        }
        try {
            return ZoneId.of(timezone.trim()).getId();
        } catch (Exception e) {
            return "UTC";
        }
    }
}
