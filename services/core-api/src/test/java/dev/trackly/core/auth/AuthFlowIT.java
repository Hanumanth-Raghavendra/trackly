package dev.trackly.core.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import dev.trackly.core.support.IntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

class AuthFlowIT extends IntegrationTest {

    @Test
    void registerSetsAHardenedRefreshCookieAndReturnsAnAccessToken() throws Exception {
        MvcResult res = register(uniqueEmail());

        assertThat(JsonPath.<String>read(res.getResponse().getContentAsString(), "$.accessToken")).isNotBlank();
        assertThat(res.getResponse().getContentAsString()).doesNotContain("refreshToken");
        String setCookie = res.getResponse().getHeader(HttpHeaders.SET_COOKIE);
        assertThat(setCookie).contains("trackly_rt=", "HttpOnly", "SameSite=Strict", "Path=/api/v1/auth");
    }

    @Test
    void protectedEndpointsRequireAValidToken() throws Exception {
        mvc.perform(get("/api/v1/users/me")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mvc.perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer not.a.jwt"))
                .andExpect(status().isUnauthorized());

        String token = registerAndGetToken();
        mvc.perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timezone").value("Asia/Kolkata"));
    }

    @Test
    void refreshRotatesTheTokenAndDetectsReuse() throws Exception {
        MvcResult reg = register(uniqueEmail());
        Cookie original = reg.getResponse().getCookie(AuthController.COOKIE);

        MvcResult refreshed = mvc.perform(post("/api/v1/auth/refresh").cookie(original))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(cookie().exists(AuthController.COOKIE))
                .andReturn();
        Cookie rotated = refreshed.getResponse().getCookie(AuthController.COOKIE);
        assertThat(rotated.getValue()).isNotEqualTo(original.getValue());

        // The legitimate client moves the chain on...
        Cookie latest = mvc.perform(post("/api/v1/auth/refresh").cookie(rotated))
                .andExpect(status().isOk())
                .andReturn().getResponse().getCookie(AuthController.COOKIE);

        // ...so replaying the old token is a theft signal: rejected AND the whole family is revoked.
        mvc.perform(post("/api/v1/auth/refresh").cookie(original)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/refresh").cookie(latest)).andExpect(status().isUnauthorized());
    }

    @Test
    void aRotationWhoseResponseWasLostDoesNotSignTheUserOut() throws Exception {
        Cookie original = register(uniqueEmail()).getResponse().getCookie(AuthController.COOKIE);

        // The browser sends a refresh, then reloads before the new cookie arrives...
        mvc.perform(post("/api/v1/auth/refresh").cookie(original)).andExpect(status().isOk());

        // ...so the next page load presents the same token again, seconds later.
        Cookie recovered = mvc.perform(post("/api/v1/auth/refresh").cookie(original))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andReturn().getResponse().getCookie(AuthController.COOKIE);

        // The session carries on normally from the recovered token.
        mvc.perform(post("/api/v1/auth/refresh").cookie(recovered)).andExpect(status().isOk());
    }

    @Test
    void loggedOutTokensCannotBeRevivedThroughTheGraceWindow() throws Exception {
        Cookie original = register(uniqueEmail()).getResponse().getCookie(AuthController.COOKIE);

        mvc.perform(post("/api/v1/auth/logout").cookie(original)).andExpect(status().isNoContent());

        mvc.perform(post("/api/v1/auth/refresh").cookie(original)).andExpect(status().isUnauthorized());
    }

    @Test
    void nativeClientsGetTheRefreshTokenInTheBodyInsteadOfACookie() throws Exception {
        MvcResult res = mvc.perform(post("/api/v1/auth/register")
                        .header("X-Client", "native")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"correct-horse-1","displayName":"Phone"}
                                """.formatted(uniqueEmail())))
                .andExpect(status().isCreated())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE))
                .andReturn();
        String refresh = JsonPath.read(res.getResponse().getContentAsString(), "$.refreshToken");

        mvc.perform(post("/api/v1/auth/refresh")
                        .header("X-Client", "native")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + refresh + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty());
    }

    @Test
    void wrongPasswordIsRejectedWithAGenericMessage() throws Exception {
        String email = uniqueEmail();
        register(email);
        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nobody@test.dev\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void duplicateEmailsAreRejectedCaseInsensitively() throws Exception {
        String email = uniqueEmail();
        register(email);
        mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"correct-horse-1","displayName":"Dup"}
                                """.formatted(email.toUpperCase())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_TAKEN"));
    }
}
