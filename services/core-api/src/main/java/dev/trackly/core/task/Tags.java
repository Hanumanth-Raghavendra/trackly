package dev.trackly.core.task;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/** Normalises user-entered tags: "#Work", " work " and "WORK" are all the same tag "work". */
public final class Tags {

    static final int MAX_TAGS = 10;
    static final int MAX_LENGTH = 32;

    private Tags() {}

    public static String[] normalize(Collection<?> raw) {
        if (raw == null) {
            return new String[0];
        }
        Set<String> out = new LinkedHashSet<>();
        for (Object o : raw) {
            if (o == null) {
                continue;
            }
            String tag = o.toString().trim().toLowerCase(Locale.ROOT);
            while (tag.startsWith("#")) {
                tag = tag.substring(1);
            }
            tag = tag.replaceAll("\\s+", "-");
            if (!tag.isEmpty()) {
                out.add(tag.length() > MAX_LENGTH ? tag.substring(0, MAX_LENGTH) : tag);
            }
            if (out.size() == MAX_TAGS) {
                break;
            }
        }
        return out.toArray(String[]::new);
    }
}
