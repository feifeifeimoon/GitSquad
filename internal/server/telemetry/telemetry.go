// Package telemetry wires the API server to an OTLP trace backend.
//
// Tracing stays off unless OTEL_EXPORTER_OTLP_ENDPOINT (or the traces-specific
// OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) is set, so local runs and tests never
// reach for the network. The HTTP exporter reads the rest of its configuration —
// headers, timeouts, TLS — from the standard OTEL_* environment variables.
package telemetry

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/version"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.43.0"
)

const (
	defaultServiceName = "gitsquad-server"

	// Reads are the bulk of the console's traffic and the least interesting
	// per-request; writes are rare enough to afford every one of them.
	defaultSampleRatio = 0.1
	sampleRatioEnv     = "GITSQUAD_OTEL_SAMPLE_RATIO"
)

// Config carries the deployment facts that become resource attributes.
type Config struct {
	Environment string
}

// Setup installs the global tracer provider and W3C propagator and returns the
// function that flushes buffered spans on shutdown. When no OTLP endpoint is
// configured it returns a no-op shutdown and leaves the globals untouched.
func Setup(ctx context.Context, cfg Config) (func(context.Context) error, error) {
	if !configured() {
		slog.Info("tracing disabled", "reason", "no OTLP endpoint")
		return func(context.Context) error { return nil }, nil
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(baseAttributes(cfg)...),
		// OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES win over the defaults
		// above, so a deployment can rename the service without a code change.
		resource.WithFromEnv(),
		resource.WithTelemetrySDK(),
	)
	if err != nil {
		return nil, fmt.Errorf("build resource: %w", err)
	}

	exp, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, fmt.Errorf("create OTLP exporter: %w", err)
	}

	ratio := sampleRatio()
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(newSampler(ratio)),
		sdktrace.WithResource(res),
		// The API machine has 256 MB. Keep the queue small and flush often, so
		// a deploy loses seconds of spans rather than minutes.
		sdktrace.WithBatcher(exp,
			sdktrace.WithMaxQueueSize(2048),
			sdktrace.WithBatchTimeout(5*time.Second),
			sdktrace.WithExportTimeout(3*time.Second),
		),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	slog.Info("tracing enabled", "sample_ratio", ratio)
	return tp.Shutdown, nil
}

func configured() bool {
	if strings.EqualFold(os.Getenv("OTEL_SDK_DISABLED"), "true") {
		return false
	}
	return os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") != "" ||
		os.Getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") != ""
}

func baseAttributes(cfg Config) []attribute.KeyValue {
	attrs := []attribute.KeyValue{
		semconv.ServiceName(defaultServiceName),
		semconv.ServiceVersion(version.Short()),
	}
	if cfg.Environment != "" {
		attrs = append(attrs,
			attribute.String("deployment.environment", cfg.Environment),
			semconv.DeploymentEnvironmentNameKey.String(cfg.Environment),
		)
	}
	// On Fly each machine gets its own id; it separates a rolling deploy's two
	// instances in the trace list.
	if id := os.Getenv("FLY_MACHINE_ID"); id != "" {
		attrs = append(attrs, semconv.ServiceInstanceID(id))
	}
	return attrs
}

// writeSampler traces every mutating request and only a fraction of reads. A
// console page load is a burst of GETs, while a webhook or a task claim is rare
// and always worth following.
type writeSampler struct {
	read sdktrace.Sampler
}

func newSampler(ratio float64) sdktrace.Sampler {
	var read sdktrace.Sampler
	switch {
	case ratio <= 0:
		read = sdktrace.NeverSample()
	case ratio >= 1:
		read = sdktrace.AlwaysSample()
	default:
		read = sdktrace.TraceIDRatioBased(ratio)
	}
	// ParentBased keeps a caller's decision: a sampled browser request stays
	// sampled, and an unsampled one is not resurrected.
	return sdktrace.ParentBased(writeSampler{read: read})
}

func (s writeSampler) ShouldSample(p sdktrace.SamplingParameters) sdktrace.SamplingResult {
	if isWrite(p.Attributes) {
		return sdktrace.SamplingResult{Decision: sdktrace.RecordAndSample}
	}
	return s.read.ShouldSample(p)
}

func (s writeSampler) Description() string {
	return "gitsquad-write-sampler:" + s.read.Description()
}

// isWrite reports whether the span describes a mutating HTTP request. Spans
// without an HTTP method — background work started from a context — fall
// through to the read ratio.
func isWrite(attrs []attribute.KeyValue) bool {
	for _, attr := range attrs {
		switch string(attr.Key) {
		case "http.request.method", "http.method":
			switch attr.Value.AsString() {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				return false
			default:
				return true
			}
		}
	}
	return false
}

func sampleRatio() float64 {
	raw := os.Getenv(sampleRatioEnv)
	if raw == "" {
		return defaultSampleRatio
	}
	ratio, err := strconv.ParseFloat(raw, 64)
	// ParseFloat accepts "NaN", and both bounds comparisons are false for it,
	// so it needs an explicit rejection before the ratio reaches the sampler.
	if err != nil || math.IsNaN(ratio) || ratio < 0 || ratio > 1 {
		slog.Warn("invalid sample ratio, using default",
			"env", sampleRatioEnv, "value", raw, "fallback", defaultSampleRatio)
		return defaultSampleRatio
	}
	return ratio
}
