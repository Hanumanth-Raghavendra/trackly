package dev.trackly.core.common;

import java.util.regex.Pattern;

public final class Colors {

    private static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");

    private Colors() {}

    /** Accepts #rrggbb colours only (prevents CSS injection into the UI); falls back otherwise. */
    public static String orDefault(String color, String fallback) {
        return color != null && HEX.matcher(color.trim()).matches() ? color.trim().toLowerCase() : fallback;
    }
}
