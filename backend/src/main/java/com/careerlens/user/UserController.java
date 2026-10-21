package com.careerlens.user;

import com.careerlens.security.AuthCookieService;
import com.careerlens.security.CurrentUser;
import com.careerlens.user.dto.ChangePasswordRequest;
import com.careerlens.user.dto.DeleteAccountRequest;
import com.careerlens.user.dto.UpdateProfileRequest;
import com.careerlens.user.dto.UserResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users/me")
@Tag(name = "User profile")
public class UserController {

    private final UserService userService;
    private final AuthCookieService cookies;

    public UserController(UserService userService, AuthCookieService cookies) {
        this.userService = userService;
        this.cookies = cookies;
    }

    @Operation(summary = "Get the signed-in user's profile")
    @GetMapping
    public UserResponse me() {
        return UserResponse.from(userService.get(CurrentUser.id()));
    }

    @Operation(summary = "Update name and headline")
    @PatchMapping
    public UserResponse update(@Valid @RequestBody UpdateProfileRequest body) {
        return UserResponse.from(userService.updateProfile(CurrentUser.id(), body));
    }

    @Operation(summary = "Change password (signs out all other sessions)")
    @PostMapping("/password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody ChangePasswordRequest body, HttpServletResponse response) {
        cookies.write(response, userService.changePassword(CurrentUser.id(), body));
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Sign out of all sessions on every device")
    @PostMapping("/sessions/revoke")
    public ResponseEntity<Void> revokeSessions(HttpServletResponse response) {
        userService.revokeAllSessions(CurrentUser.id());
        cookies.clear(response);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Permanently delete the account and all associated data")
    @DeleteMapping
    public ResponseEntity<Void> delete(@Valid @RequestBody DeleteAccountRequest body, HttpServletResponse response) {
        userService.deleteAccount(CurrentUser.id(), body.password());
        cookies.clear(response);
        return ResponseEntity.noContent().build();
    }
}
