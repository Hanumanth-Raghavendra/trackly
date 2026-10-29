package dev.trackly.core.support;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * Base for tests that boot the whole application against a real Postgres database.
 * Each test registers its own fresh user, so tests never share state and need no cleanup.
 */
@SpringBootTest
@ActiveProfiles("test")
@Tag("integration")
public abstract class IntegrationTest {

    @Autowired
    protected WebApplicationContext context;

    @Autowired
    protected JdbcTemplate jdbc;

    protected MockMvc mvc;

    @BeforeEach
    void setUpMockMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    protected static String uniqueEmail() {
        return "user-" + UUID.randomUUID().toString().substring(0, 8) + "@test.dev";
    }

    /** Registers a new user and returns their access token. */
    protected String registerAndGetToken() throws Exception {
        return JsonPath.read(register(uniqueEmail()).getResponse().getContentAsString(), "$.accessToken");
    }

    protected MvcResult register(String email) throws Exception {
        return mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"correct-horse-1","displayName":"Test","timezone":"Asia/Kolkata"}
                                """.formatted(email)))
                .andExpect(status().isCreated())
                .andReturn();
    }

    protected static String bearer(String token) {
        return "Bearer " + token;
    }
}
