package dev.trackly.core.goal;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class GoalProgressTest {

    @Test
    void blendsTasksAndHabits() {
        // 50% of tasks done, habits 100% consistent => 0.7*0.5 + 0.3*1.0 = 65%
        var p = GoalService.progress(Goal.Status.ACTIVE, new long[] {4, 2}, 1, 1.0);
        assertThat(p.percent()).isEqualTo(65);
    }

    @Test
    void tasksOnly() {
        var p = GoalService.progress(Goal.Status.ACTIVE, new long[] {4, 3}, 0, 0);
        assertThat(p.percent()).isEqualTo(75);
    }

    @Test
    void habitsOnly() {
        var p = GoalService.progress(Goal.Status.ACTIVE, null, 2, 0.42);
        assertThat(p.percent()).isEqualTo(42);
    }

    @Test
    void completedGoalIsAlwaysFull() {
        var p = GoalService.progress(Goal.Status.COMPLETED, new long[] {10, 1}, 0, 0);
        assertThat(p.percent()).isEqualTo(100);
    }
}
