#pragma once

#ifdef _WIN32
#define RS_EXPORT extern "C" __declspec(dllexport)
#else
#define RS_EXPORT extern "C" __attribute__((visibility("default")))
#endif

RS_EXPORT int rs_validate_listing(
    const char* title,
    const char* category,
    const char* description,
    long long price,
    int ownership_confirmed
);

RS_EXPORT int rs_sensitive_flags(const char* text);

RS_EXPORT int rs_price_stats(
    const double* values,
    int count,
    double* minimum,
    double* maximum,
    double* average
);