
Next steps:
Refactor MetricsMiddleware to use BoxBody as the response type everywhere (remove EitherBody).
Ensure all middleware Transform and Service implementations use BoxBody as the response type.