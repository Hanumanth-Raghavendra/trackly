package dev.trackly.core.habit;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import dev.trackly.core.support.IntegrationTest;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class HabitApiIT extends IntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private String createHabit(String token) throws Exception {
        String body = mvc.perform(post("/api/v1/habits")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Read\",\"icon\":\"📚\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.frequencyType").value("DAILY"))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    @Test
    void checkInIsIdempotentAndUndoable() throws Exception {
        String token = registerAndGetToken();
        String id = createHabit(token);
        String today = LocalDate.now(IST).toString();

        for (int i = 0; i < 2; i++) {
            mvc.perform(put("/api/v1/habits/" + id + "/checkins/" + today)
                            .header(HttpHeaders.AUTHORIZATION, bearer(token))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"mood\":4}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.stats.currentStreak").value(1))
                    .andExpect(jsonPath("$.stats.totalCheckins").value(1));
        }

        mvc.perform(delete("/api/v1/habits/" + id + "/checkins/" + today)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stats.doneToday").value(false));
    }

    @Test
    void futureCheckInsAreRejected() throws Exception {
        String token = registerAndGetToken();
        String id = createHabit(token);
        mvc.perform(put("/api/v1/habits/" + id + "/checkins/" + LocalDate.now(IST).plusDays(2))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("FUTURE_DATE"));
    }

    @Test
    void specificDaysNeedAtLeastOneDay() throws Exception {
        String token = registerAndGetToken();
        mvc.perform(post("/api/v1/habits")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Gym\",\"frequencyType\":\"SPECIFIC_DAYS\",\"daysOfWeek\":[]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void freezeSpendsATokenToProtectAMissedDay() throws Exception {
        String token = registerAndGetToken();
        String id = createHabit(token);
        String yesterday = LocalDate.now(IST).minusDays(1).toString();

        mvc.perform(post("/api/v1/habits/" + id + "/freeze/" + yesterday)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.freezeTokens").value(0));
        mvc.perform(post("/api/v1/habits/" + id + "/freeze/" + LocalDate.now(IST).minusDays(2))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NO_FREEZE_TOKENS"));
    }

    @Test
    void clientMistakesAreNeverServerErrors() throws Exception {
        String token = registerAndGetToken();
        // A missing query parameter is a 400, not a 500.
        mvc.perform(get("/api/v1/habits/checkins").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
        // A method that doesn't exist on a real path is a 405.
        mvc.perform(put("/api/v1/habits").header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
        // A body that isn't JSON is a 415.
        mvc.perform(post("/api/v1/habits").header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.TEXT_PLAIN).content("name=Read"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));
    }
}
