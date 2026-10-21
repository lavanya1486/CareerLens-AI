package com.careerlens.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI careerLensOpenApi(AppProperties props) {
        return new OpenAPI()
                .info(new Info()
                        .title("CareerLens AI API")
                        .version("v1")
                        .description("Resume and job description matching with explainable NLP analysis. "
                                + "Authentication uses an HttpOnly session cookie; state-changing requests also need "
                                + "the X-XSRF-TOKEN header mirroring the XSRF-TOKEN cookie.")
                        .license(new License().name("MIT")))
                .components(new Components().addSecuritySchemes("sessionCookie", new SecurityScheme()
                        .type(SecurityScheme.Type.APIKEY)
                        .in(SecurityScheme.In.COOKIE)
                        .name(props.cookie().name())))
                .addSecurityItem(new SecurityRequirement().addList("sessionCookie"));
    }
}
