package dev.trackly.core.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.trackly.core.config.DatabaseUrl;
import org.junit.jupiter.api.Test;

class DatabaseUrlTest {

    @Test
    void convertsNeonStyleUriToJdbc() {
        var settings = DatabaseUrl.parse(
                "postgresql://neondb_owner:p%40ss@ep-cool-1.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")
                .orElseThrow();

        assertThat(settings.url())
                .isEqualTo("jdbc:postgresql://ep-cool-1.ap-southeast-1.aws.neon.tech:5432/neondb?sslmode=require");
        assertThat(settings.username()).isEqualTo("neondb_owner");
        assertThat(settings.password()).isEqualTo("p@ss");
    }

    @Test
    void keepsExplicitPort() {
        var settings = DatabaseUrl.parse("postgres://u:p@localhost:6543/app").orElseThrow();
        assertThat(settings.url()).isEqualTo("jdbc:postgresql://localhost:6543/app");
    }

    @Test
    void passesJdbcUrlThrough() {
        var settings = DatabaseUrl.parse("jdbc:postgresql://localhost/app").orElseThrow();
        assertThat(settings.url()).isEqualTo("jdbc:postgresql://localhost/app");
        assertThat(settings.username()).isNull();
    }

    @Test
    void blankMeansNotConfigured() {
        assertThat(DatabaseUrl.parse("  ")).isEmpty();
        assertThat(DatabaseUrl.parse(null)).isEmpty();
    }

    @Test
    void rejectsUnknownSchemes() {
        assertThatThrownBy(() -> DatabaseUrl.parse("mysql://x"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
