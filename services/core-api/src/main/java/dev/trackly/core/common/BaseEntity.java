package dev.trackly.core.common;

import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Transient;
import java.util.UUID;
import org.springframework.data.domain.Persistable;

/**
 * Base for entities with application-assigned UUIDs.
 *
 * <p>Assigning the id in Java means it is known before the INSERT — handy for writing the
 * matching outbox event in the same transaction. Implementing {@link Persistable} tells Spring
 * Data the entity is new, so {@code save()} does a plain INSERT instead of a SELECT + merge.
 */
@MappedSuperclass
public abstract class BaseEntity implements Persistable<UUID> {

    @Id
    protected UUID id = UUID.randomUUID();

    @Transient
    private boolean isNew = true;

    @Override
    public UUID getId() {
        return id;
    }

    @Override
    public boolean isNew() {
        return isNew;
    }

    @PostLoad
    @PostPersist
    void markNotNew() {
        this.isNew = false;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (o == null || getClass() != o.getClass()) {
            return false;
        }
        return id.equals(((BaseEntity) o).id);
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }
}
