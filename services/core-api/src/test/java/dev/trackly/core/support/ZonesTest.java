package dev.trackly.core.support;

import static org.assertj.core.api.Assertions.assertThat;

import dev.trackly.core.common.Zones;
import org.junit.jupiter.api.Test;

class ZonesTest {

    @Test
    void mapsLegacyBrowserNamesToCanonicalOnes() {
        assertThat(Zones.normalize("Asia/Calcutta")).isEqualTo("Asia/Kolkata");
        assertThat(Zones.normalize(" Europe/Kiev ")).isEqualTo("Europe/Kyiv");
    }

    @Test
    void keepsValidZonesAndFallsBackToUtc() {
        assertThat(Zones.normalize("America/New_York")).isEqualTo("America/New_York");
        assertThat(Zones.normalize("Mars/Olympus_Mons")).isEqualTo("UTC");
        assertThat(Zones.normalize(null)).isEqualTo("UTC");
    }
}
