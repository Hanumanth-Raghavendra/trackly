package dev.trackly.core.common;

import java.time.ZoneId;
import java.util.Map;

public final class Zones {

    /**
     * Legacy IANA names that browsers still report (Chrome on Indian systems sends
     * "Asia/Calcutta") but some databases' timezone tables don't include.
     */
    private static final Map<String, String> ALIASES = Map.ofEntries(
            Map.entry("Asia/Calcutta", "Asia/Kolkata"),
            Map.entry("Asia/Saigon", "Asia/Ho_Chi_Minh"),
            Map.entry("Asia/Katmandu", "Asia/Kathmandu"),
            Map.entry("Asia/Rangoon", "Asia/Yangon"),
            Map.entry("Asia/Dacca", "Asia/Dhaka"),
            Map.entry("Asia/Thimbu", "Asia/Thimphu"),
            Map.entry("Asia/Ulan_Bator", "Asia/Ulaanbaatar"),
            Map.entry("Europe/Kiev", "Europe/Kyiv"),
            Map.entry("America/Buenos_Aires", "America/Argentina/Buenos_Aires"),
            Map.entry("America/Indianapolis", "America/Indiana/Indianapolis"),
            Map.entry("Pacific/Truk", "Pacific/Chuuk"),
            Map.entry("Atlantic/Faeroe", "Atlantic/Faroe"));

    private Zones() {}

    /** Returns a canonical IANA zone id if valid, otherwise UTC. Browsers send e.g. "Asia/Kolkata". */
    public static String normalize(String timezone) {
        if (timezone == null || timezone.isBlank()) {
            return "UTC";
        }
        String tz = ALIASES.getOrDefault(timezone.trim(), timezone.trim());
        try {
            return ZoneId.of(tz).getId();
        } catch (Exception e) {
            return "UTC";
        }
    }
}
