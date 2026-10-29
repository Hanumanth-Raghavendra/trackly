package dev.trackly.core.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Swagger UI at /swagger-ui.html — click "Authorize" and paste an access token. */
@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI trackOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Trackly Core API")
                        .version("v1")
                        .description("System of record for Trackly: auth, tasks, habits, goals and focus sessions. "
                                + "Every change is also published to a transactional outbox for the insights service.")
                        .license(new License().name("MIT")))
                .components(new Components().addSecuritySchemes("bearer",
                        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList("bearer"));
    }
}
