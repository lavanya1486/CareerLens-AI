package com.careerlens.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.careerlens.auth.dto.LoginRequest;
import com.careerlens.auth.dto.RegisterRequest;
import com.careerlens.common.error.ApiException;
import com.careerlens.security.JwtService;
import com.careerlens.user.User;
import com.careerlens.user.UserRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuthServiceTest {

    @Mock UserRepository users;
    @Mock PasswordEncoder encoder;
    @Mock JwtService jwt;
    private AuthService service;

    @BeforeEach
    void setUp() {
        when(encoder.encode(anyString())).thenAnswer(inv -> "hash:" + inv.getArgument(0));
        when(jwt.issue(any(UUID.class), any(Integer.class))).thenReturn("signed.jwt.token");
        when(users.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        service = new AuthService(users, encoder, jwt);
    }

    @Test
    void registerNormalisesEmailAndHashesPassword() {
        AuthService.AuthResult result = service.register(new RegisterRequest("  Ananya@Example.TEST ", "Str0ngPassw0rd", " Ananya Rao "));

        assertThat(result.user().getEmail()).isEqualTo("ananya@example.test");
        assertThat(result.user().getFullName()).isEqualTo("Ananya Rao");
        assertThat(result.user().getPasswordHash()).isEqualTo("hash:Str0ngPassw0rd");
        assertThat(result.token()).isEqualTo("signed.jwt.token");
    }

    @Test
    void registerRejectsDuplicateEmail() {
        when(users.existsByEmail("taken@example.test")).thenReturn(true);

        assertThatThrownBy(() -> service.register(new RegisterRequest("TAKEN@example.test", "Str0ngPassw0rd", "X")))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getStatus()).isEqualTo(HttpStatus.CONFLICT));
        verify(users, never()).save(any());
    }

    @Test
    void wrongPasswordAndUnknownEmailGiveTheSameGenericError() {
        User user = new User("a@example.test", "hash:right", "A");
        when(users.findByEmail("a@example.test")).thenReturn(Optional.of(user));
        when(encoder.matches("wrong", "hash:right")).thenReturn(false);

        ApiException wrongPassword = catchApi(() -> service.login(new LoginRequest("a@example.test", "wrong")));
        ApiException unknownEmail = catchApi(() -> service.login(new LoginRequest("nobody@example.test", "wrong")));

        assertThat(wrongPassword.getCode()).isEqualTo("INVALID_CREDENTIALS").isEqualTo(unknownEmail.getCode());
        assertThat(wrongPassword.getMessage()).isEqualTo(unknownEmail.getMessage());
        // Unknown emails still run a BCrypt comparison so response timing does not reveal registered accounts.
        verify(encoder).matches(eq("wrong"), eq("hash:timing-equaliser-not-a-password-1"));
    }

    @Test
    void successfulLoginIssuesTokenWithCurrentVersion() {
        User user = new User("a@example.test", "hash:right", "A");
        when(users.findByEmail("a@example.test")).thenReturn(Optional.of(user));
        when(encoder.matches("right", "hash:right")).thenReturn(true);

        assertThat(service.login(new LoginRequest("A@example.test", "right")).token()).isEqualTo("signed.jwt.token");
        verify(jwt).issue(user.getId(), user.getTokenVersion());
    }

    private static ApiException catchApi(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e;
        }
        throw new AssertionError("Expected ApiException");
    }
}
