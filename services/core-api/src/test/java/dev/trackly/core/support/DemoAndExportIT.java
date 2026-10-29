package dev.trackly.core.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class DemoAndExportIT extends IntegrationTest {

    @Test
    void demoAccountComesWithEightWeeksOfHistory() throws Exception {
        String body = mvc.perform(post("/api/v1/auth/demo")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"timezone\":\"Asia/Kolkata\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.demo").value(true))
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(body, "$.accessToken");
        String userId = JsonPath.read(body, "$.user.id");

        String tasks = mvc.perform(get("/api/v1/tasks").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<Integer>read(tasks, "$.length()")).isGreaterThan(150);

        mvc.perform(get("/api/v1/habits").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.length()").value(6));

        Integer events = jdbc.queryForObject(
                "select count(*) from core.outbox_events where user_id = ?::uuid", Integer.class, userId);
        assertThat(events).isGreaterThan(400);
    }

    @Test
    void exportContainsEverythingAndDeleteRemovesIt() throws Exception {
        String token = registerAndGetToken();
        mvc.perform(post("/api/v1/tasks")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Exported task\"}"))
                .andExpect(status().isCreated());

        mvc.perform(get("/api/v1/export").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.format").value("trackly-export/v1"))
                .andExpect(jsonPath("$.tasks[0].title").value("Exported task"));

        mvc.perform(delete("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNotFound());
    }
}
