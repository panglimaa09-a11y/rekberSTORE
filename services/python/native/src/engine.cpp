#include "engine.h"

#include <algorithm>
#include <cctype>
#include <cstring>
#include <limits>
#include <string>
#include <vector>

static std::string lower_text(const char* input) {
    if (!input) return "";

    std::string result(input);

    std::transform(
        result.begin(),
        result.end(),
        result.begin(),
        [](unsigned char c) {
            return static_cast<char>(std::tolower(c));
        }
    );

    return result;
}

RS_EXPORT int rs_validate_listing(
    const char* title,
    const char* category,
    const char* description,
    long long price,
    int ownership_confirmed
) {
    if (!title || std::strlen(title) < 5 || std::strlen(title) > 100)
        return 1;

    if (!category)
        return 2;

    const std::vector<std::string> allowed = {
        "Gaming",
        "Kreator",
        "Komunitas",
        "Bisnis digital",
        "Aset digital lainnya"
    };

    if (std::find(allowed.begin(), allowed.end(), category) == allowed.end())
        return 2;

    if (!description || std::strlen(description) < 20 || std::strlen(description) > 3000)
        return 3;

    if (price < 1000 || price > 1000000000000LL)
        return 4;

    if (ownership_confirmed != 1)
        return 5;

    return 0;
}

RS_EXPORT int rs_sensitive_flags(const char* text) {
    if (!text) return 0;

    const std::string value = lower_text(text);

    const char* terms[] = {
        "password",
        "otp",
        "recovery code",
        "seed phrase",
        "private key"
    };

    int flags = 0;

    for (int i = 0; i < 5; ++i) {
        if (value.find(terms[i]) != std::string::npos) {
            flags |= (1 << i);
        }
    }

    return flags;
}

RS_EXPORT int rs_price_stats(
    const double* values,
    int count,
    double* minimum,
    double* maximum,
    double* average
) {
    if (!values || count <= 0 || !minimum || !maximum || !average)
        return 1;

    double low = std::numeric_limits<double>::max();
    double high = std::numeric_limits<double>::lowest();
    long double total = 0;

    for (int i = 0; i < count; ++i) {
        if (values[i] < 0)
            return 2;

        low = std::min(low, values[i]);
        high = std::max(high, values[i]);
        total += values[i];
    }

    *minimum = low;
    *maximum = high;
    *average = static_cast<double>(total / count);

    return 0;
}