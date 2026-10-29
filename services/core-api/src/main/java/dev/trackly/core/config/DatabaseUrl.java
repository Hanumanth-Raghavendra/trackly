package dev.trackly.core.config;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Converts a Neon/Heroku-style {@code postgres://user:pass@host:port/db?sslmode=require} URI into
 * the JDBC URL + credentials Spring expects.
 *
 * <p>This lets both services share one {@code DATABASE_URL} value copied straight from the Neon
 * dashboard: the Node service uses it as-is, and this class adapts it for the JVM.
 */
public final class DatabaseUrl {

    /** Query parameters that pgjdbc understands and that we pass through. */
    private static final List<String> PASS_THROUGH_PARAMS = List.of("sslmode", "options", "connectTimeout");

    private DatabaseUrl() {}

    public record JdbcSettings(String url, String username, String password) {}

    /** Returns JDBC settings when the value is a postgres URI, empty when it is already JDBC or blank. */
    public static Optional<JdbcSettings> parse(String databaseUrl) {
        if (databaseUrl == null || databaseUrl.isBlank()) {
            return Optional.empty();
        }
        String value = databaseUrl.trim();
        if (value.startsWith("jdbc:")) {
            return Optional.of(new JdbcSettings(value, null, null));
        }
        if (!value.startsWith("postgres://") && !value.startsWith("postgresql://")) {
            throw new IllegalArgumentException("DATABASE_URL must start with postgres://, postgresql:// or jdbc:");
        }

        URI uri = URI.create(value);
        String username = null;
        String password = null;
        String userInfo = uri.getRawUserInfo();
        if (userInfo != null) {
            int colon = userInfo.indexOf(':');
            username = decode(colon >= 0 ? userInfo.substring(0, colon) : userInfo);
            password = colon >= 0 ? decode(userInfo.substring(colon + 1)) : null;
        }

        int port = uri.getPort() == -1 ? 5432 : uri.getPort();
        String database = uri.getPath() == null || uri.getPath().isBlank() ? "/postgres" : uri.getPath();

        List<String> params = new ArrayList<>();
        if (uri.getRawQuery() != null) {
            for (String pair : uri.getRawQuery().split("&")) {
                int eq = pair.indexOf('=');
                String key = eq >= 0 ? pair.substring(0, eq) : pair;
                if (PASS_THROUGH_PARAMS.contains(key)) {
                    params.add(pair);
                }
            }
        }
        String jdbc = "jdbc:postgresql://" + uri.getHost() + ":" + port + database
                + (params.isEmpty() ? "" : "?" + String.join("&", params));
        return Optional.of(new JdbcSettings(jdbc, username, password));
    }

    /**
     * Reads {@code DATABASE_URL} from the environment and exposes it as Spring datasource system
     * properties (which outrank application.yml). Called from {@code main} before Spring starts.
     */
    public static void applyFromEnvironment(Map<String, String> env) {
        parse(env.get("DATABASE_URL")).ifPresent(settings -> {
            System.setProperty("spring.datasource.url", settings.url());
            if (settings.username() != null) {
                System.setProperty("spring.datasource.username", settings.username());
            }
            if (settings.password() != null) {
                System.setProperty("spring.datasource.password", settings.password());
            }
        });
    }

    private static String decode(String raw) {
        return URLDecoder.decode(raw, StandardCharsets.UTF_8);
    }
}
