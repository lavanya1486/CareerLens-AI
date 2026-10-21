package com.careerlens.user;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    /** Bulk delete so PostgreSQL ON DELETE CASCADE removes resumes, comparisons and results. */
    @Modifying
    @Query("delete from User u where u.id = :id")
    int hardDelete(@Param("id") UUID id);
}
