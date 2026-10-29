package dev.trackly.core.task;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

public interface TaskRepository extends JpaRepository<Task, UUID>, JpaSpecificationExecutor<Task> {

    Optional<Task> findByIdAndUserId(UUID id, UUID userId);

    List<Task> findByParentId(UUID parentId);

    @Query("select coalesce(max(t.position), 0) from Task t where t.userId = ?1 and t.status = ?2")
    double maxPosition(UUID userId, TaskEnums.Status status);

    /** [goalId, total, done] rows for the user's goals. */
    @Query("""
            select t.goalId, count(t), sum(case when t.status = dev.trackly.core.task.TaskEnums.Status.DONE then 1 else 0 end)
            from Task t where t.userId = ?1 and t.goalId is not null and t.parentId is null
            group by t.goalId
            """)
    List<Object[]> goalProgress(UUID userId);
}
