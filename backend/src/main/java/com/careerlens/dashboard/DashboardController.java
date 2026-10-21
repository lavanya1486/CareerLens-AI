package com.careerlens.dashboard;

import com.careerlens.dashboard.dto.DashboardResponse;
import com.careerlens.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/dashboard")
@Tag(name = "Dashboard")
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @Operation(summary = "Analytics computed from the signed-in user's saved comparisons")
    @GetMapping
    public DashboardResponse get() {
        return dashboardService.build(CurrentUser.id());
    }
}
