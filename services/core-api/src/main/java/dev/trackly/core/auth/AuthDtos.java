package dev.trackly.core.auth;

import com.fasterxml.jackson.annotation.JsonInclude;
import dev.trackly.core.user.UserDto;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 8, max = 72, message = "must be 8-72 characters") String password,
            @NotBlank @Size(max = 80) String displayName,
            @Size(max = 64) String timezone) {}

    public record LoginRequest(
            @NotBlank @Email String email,
            @NotBlank String password) {}

    /** Native (mobile) clients send the refresh token in the body; browsers use the cookie. */
    public record RefreshRequest(String refreshToken) {}

    public record DemoRequest(@Size(max = 64) String timezone) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AuthResponse(
            String accessToken,
            long expiresIn,
            UserDto user,
            /* only for native clients, which cannot use httpOnly cookies across origins */
            String refreshToken) {}
}
