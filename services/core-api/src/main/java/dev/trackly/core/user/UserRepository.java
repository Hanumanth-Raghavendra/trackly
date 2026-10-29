package dev.trackly.core.user;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UserRepository extends JpaRepository<User, UUID> {

    @Query("select u from User u where lower(u.email) = lower(?1)")
    Optional<User> findByEmailIgnoreCase(String email);

    @Query("select count(u) > 0 from User u where lower(u.email) = lower(?1)")
    boolean existsByEmailIgnoreCase(String email);

    @Query("select u.id from User u where u.demo = true and u.createdAt < ?1")
    List<UUID> findExpiredDemoUserIds(Instant createdBefore);
}
