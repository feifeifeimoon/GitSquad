package telemetry

import (
	"context"
	"net/http"
	"testing"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

func TestSetupDisabledWithoutEndpoint(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
	t.Setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "")
	t.Setenv("OTEL_SDK_DISABLED", "")

	shutdown, err := Setup(context.Background(), Config{Environment: "test"})
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}
	if shutdown == nil {
		t.Fatal("Setup returned a nil shutdown")
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
}

func TestSetupDisabledBySDKSwitch(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318")
	t.Setenv("OTEL_SDK_DISABLED", "true")

	prev := otel.GetTracerProvider()
	t.Cleanup(func() { otel.SetTracerProvider(prev) })

	shutdown, err := Setup(context.Background(), Config{})
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
	if otel.GetTracerProvider() != prev {
		t.Fatal("Setup replaced the tracer provider while disabled")
	}
}

func TestSetupEnabledInstallsProvider(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318")
	t.Setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "")
	t.Setenv("OTEL_SDK_DISABLED", "")

	prev := otel.GetTracerProvider()
	t.Cleanup(func() { otel.SetTracerProvider(prev) })

	shutdown, err := Setup(context.Background(), Config{Environment: "test"})
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}

	// No spans were recorded, so Shutdown has nothing to export and must not
	// touch the network.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := shutdown(ctx); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
	if otel.GetTracerProvider() == prev {
		t.Fatal("Setup did not install the tracer provider")
	}
}

func TestSamplerTracesWritesAndSamplesReads(t *testing.T) {
	tests := []struct {
		name   string
		ratio  float64
		method string
		want   sdktrace.SamplingDecision
	}{
		{name: "write at zero ratio", ratio: 0, method: http.MethodPost, want: sdktrace.RecordAndSample},
		{name: "delete at zero ratio", ratio: 0, method: http.MethodDelete, want: sdktrace.RecordAndSample},
		{name: "read at zero ratio", ratio: 0, method: http.MethodGet, want: sdktrace.Drop},
		{name: "read at full ratio", ratio: 1, method: http.MethodGet, want: sdktrace.RecordAndSample},
		{name: "background work at zero ratio", ratio: 0, want: sdktrace.Drop},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			attrs := []attribute.KeyValue{}
			if tt.method != "" {
				attrs = append(attrs, attribute.String("http.request.method", tt.method))
			}
			got := newSampler(tt.ratio).ShouldSample(sdktrace.SamplingParameters{
				ParentContext: context.Background(),
				Name:          "HTTP " + tt.method,
				Attributes:    attrs,
			})
			if got.Decision != tt.want {
				t.Fatalf("decision = %v, want %v", got.Decision, tt.want)
			}
		})
	}
}

func TestSampleRatio(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  float64
	}{
		{name: "default", want: defaultSampleRatio},
		{name: "valid", value: "0.25", want: 0.25},
		{name: "zero", value: "0", want: 0},
		{name: "one", value: "1", want: 1},
		{name: "not a number", value: "many", want: defaultSampleRatio},
		{name: "negative", value: "-0.5", want: defaultSampleRatio},
		{name: "above one", value: "1.5", want: defaultSampleRatio},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(sampleRatioEnv, tt.value)
			if got := sampleRatio(); got != tt.want {
				t.Fatalf("sampleRatio() = %v, want %v", got, tt.want)
			}
		})
	}
}
