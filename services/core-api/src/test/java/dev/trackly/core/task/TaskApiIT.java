package dev.trackly.core.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import dev.trackly.core.support.IntegrationTest;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class TaskApiIT extends IntegrationTest {

    private String createTask(String token, String json) throws Exception {
        String body = mvc.perform(post("/api/v1/tasks")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    private List<String> outboxTypes(String aggregateId) {
        return jdbc.queryForList("select event_type from core.outbox_events where aggregate_id = ?::uuid order by id",
                String.class, aggregateId);
    }

    @Test
    void createNormalisesTagsAndWritesAnOutboxEvent() throws Exception {
        String token = registerAndGetToken();
        String id = createTask(token, """
                {"title":"  Write tests  ","priority":"HIGH","tags":["#Java","java","Deep Work"]}
                """);

        mvc.perform(get("/api/v1/tasks/" + id).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Write tests"))
                .andExpect(jsonPath("$.tags", contains("java", "deep-work")));
        assertThat(outboxTypes(id)).containsExactly("TASK_CREATED");
    }

    @Test
    void patchFollowsMergePatchSemantics() throws Exception {
        String token = registerAndGetToken();
        String id = createTask(token, """
                {"title":"Pay rent","description":"before the 5th","dueAt":"2026-11-05T12:00:00Z"}
                """);

        // Absent fields stay; explicit null clears.
        mvc.perform(patch("/api/v1/tasks/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dueAt\":null,\"priority\":\"urgent\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.task.dueAt").doesNotExist())
                .andExpect(jsonPath("$.task.description").value("before the 5th"))
                .andExpect(jsonPath("$.task.priority").value("URGENT"));
    }

    @Test
    void completingARecurringTaskSchedulesTheNextOne() throws Exception {
        String token = registerAndGetToken();
        String id = createTask(token, """
                {"title":"Water plants","dueAt":"2099-01-01T03:30:00Z","recurrence":"WEEKLY"}
                """);

        String body = mvc.perform(post("/api/v1/tasks/" + id + "/complete")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.task.status").value("DONE"))
                .andExpect(jsonPath("$.nextOccurrence.dueAt").value("2099-01-08T03:30:00Z"))
                .andReturn().getResponse().getContentAsString();

        assertThat(outboxTypes(id)).containsExactly("TASK_CREATED", "TASK_COMPLETED");
        String nextId = JsonPath.read(body, "$.nextOccurrence.id");
        assertThat(outboxTypes(nextId)).containsExactly("TASK_CREATED");

        // Completing again is a no-op (idempotent): no duplicate events, no second spawn.
        mvc.perform(post("/api/v1/tasks/" + id + "/complete").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nextOccurrence").doesNotExist());
        assertThat(outboxTypes(id)).hasSize(2);
    }

    @Test
    void usersCannotSeeEachOthersTasks() throws Exception {
        String alice = registerAndGetToken();
        String bob = registerAndGetToken();
        String id = createTask(alice, "{\"title\":\"Alice's secret\"}");

        mvc.perform(get("/api/v1/tasks/" + id).header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/tasks/" + id).header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/tasks").header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void subtasksAreOneLevelDeepAndDeletedWithTheirParent() throws Exception {
        String token = registerAndGetToken();
        String parent = createTask(token, "{\"title\":\"Launch\"}");
        String child = createTask(token, "{\"title\":\"Write post\",\"parentId\":\"" + parent + "\"}");

        mvc.perform(post("/api/v1/tasks")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Too deep\",\"parentId\":\"" + child + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARENT"));

        mvc.perform(delete("/api/v1/tasks/" + parent).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/tasks/" + child).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNotFound());
        assertThat(outboxTypes(child)).containsExactly("TASK_CREATED", "TASK_DELETED");
    }
}
