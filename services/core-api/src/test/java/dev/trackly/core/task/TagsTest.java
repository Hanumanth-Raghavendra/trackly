package dev.trackly.core.task;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class TagsTest {

    @Test
    void normalisesCaseHashesAndSpaces() {
        assertThat(Tags.normalize(List.of("#Work", " work ", "Deep Work", "##java")))
                .containsExactly("work", "deep-work", "java");
    }

    @Test
    void dropsBlanksAndNulls() {
        assertThat(Tags.normalize(Arrays.asList("  ", null, "#", "ok"))).containsExactly("ok");
    }

    @Test
    void capsCountAndLength() {
        var many = java.util.stream.IntStream.range(0, 20).mapToObj(i -> "t" + i).toList();
        assertThat(Tags.normalize(many)).hasSize(10);
        assertThat(Tags.normalize(List.of("x".repeat(50)))[0]).hasSize(32);
    }

    @Test
    void nullMeansNoTags() {
        assertThat(Tags.normalize(null)).isEmpty();
    }
}
