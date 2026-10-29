package dev.trackly.core.user;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class UserRequests {

    private UserRequests() {}

    public record UpdateProfile(
            @Size(min = 1, max = 80) String displayName,
            @Size(max = 64) String timezone,
            @Min(10) @Max(600) Integer focusGoalMinutes) {}

    public record ChangePassword(
            @NotBlank String currentPassword,
            @NotBlank @Size(min = 8, max = 72, message = "must be 8-72 characters") String newPassword) {}
}
