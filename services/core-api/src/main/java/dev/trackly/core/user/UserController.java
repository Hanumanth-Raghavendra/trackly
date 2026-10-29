package dev.trackly.core.user;

import dev.trackly.core.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users/me")
@Tag(name = "Account")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    @Operation(summary = "Current user's profile")
    public UserDto me(@AuthenticationPrincipal AuthUser me) {
        return UserDto.from(userService.get(me.id()));
    }

    @PatchMapping
    @Operation(summary = "Update name, timezone or daily focus goal")
    public UserDto update(@AuthenticationPrincipal AuthUser me, @Valid @RequestBody UserRequests.UpdateProfile req) {
        return UserDto.from(userService.update(me.id(), req));
    }

    @PutMapping("/password")
    @Operation(summary = "Change password")
    public ResponseEntity<Void> changePassword(@AuthenticationPrincipal AuthUser me,
                                               @Valid @RequestBody UserRequests.ChangePassword req) {
        userService.changePassword(me.id(), req);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    @Operation(summary = "Permanently delete the account and all its data")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthUser me) {
        userService.delete(me.id());
        return ResponseEntity.noContent().build();
    }
}
