package com.careerlens.integration;

import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Full application context against a real PostgreSQL database (careerlens_test, rebuilt with Flyway once per
 * run) and the fake AI service at the HTTP boundary.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(IntegrationTestBase.CleanDatabase.class)
abstract class IntegrationTestBase {

    @Autowired protected MockMvc mvc;
    @Autowired protected JdbcTemplate jdbc;

    @DynamicPropertySource
    static void aiService(DynamicPropertyRegistry registry) {
        registry.add("app.ai-service.base-url", FakeAiService::baseUrl);
        registry.add("app.ai-service.api-key", () -> "test-internal-key");
    }

    protected Session newSession() {
        return new Session(mvc);
    }

    @TestConfiguration
    static class CleanDatabase {
        @Bean
        FlywayMigrationStrategy cleanThenMigrate() {
            return (Flyway flyway) -> {
                flyway.clean();
                flyway.migrate();
            };
        }
    }
}
