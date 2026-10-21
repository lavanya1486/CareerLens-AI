package com.careerlens.resume;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "resumes")
public class Resume {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(nullable = false, length = 120)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false, length = 10)
    private ResumeSource sourceType;

    @Column(name = "original_filename")
    private String originalFilename;

    @Column(name = "page_count")
    private Integer pageCount;

    @Column(name = "content_text", nullable = false, columnDefinition = "text")
    private String contentText;

    @Column(name = "char_count", nullable = false)
    private int charCount;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Resume() {
    }

    public Resume(UUID userId, String title, ResumeSource sourceType, String originalFilename, Integer pageCount,
                  String contentText) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.title = title;
        this.sourceType = sourceType;
        this.originalFilename = originalFilename;
        this.pageCount = pageCount;
        setContentText(contentText);
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public void setContentText(String contentText) {
        this.contentText = contentText;
        this.charCount = contentText.length();
    }

    public void setTitle(String title) { this.title = title; }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getTitle() { return title; }
    public ResumeSource getSourceType() { return sourceType; }
    public String getOriginalFilename() { return originalFilename; }
    public Integer getPageCount() { return pageCount; }
    public String getContentText() { return contentText; }
    public int getCharCount() { return charCount; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
