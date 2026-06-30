package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

// Client is a lightweight HTTP client for the GitSquad server API.
type Client struct {
	BaseURL    string
	Token      string
	HTTPClient *http.Client
}

// New returns a Client. If httpClient is nil, http.DefaultClient is used.
func New(baseURL, token string) *Client {
	return &Client{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		Token:      token,
		HTTPClient: http.DefaultClient,
	}
}

// Do sends an HTTP request to path (relative to BaseURL) and unmarshals the
// response envelope's "data" field into result. If result is nil, the data
// field is discarded. The method automatically sets Content-Type and the
// Authorization header when Client.Token is non-empty.
func (c *Client) Do(ctx context.Context, method, path string, body any, result any) error {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 300 {
		var env pkgtypes.APIResponse
		if json.Unmarshal(respBytes, &env) == nil && env.Message != "" {
			return fmt.Errorf("%s", env.Message)
		}
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(respBytes)))
	}

	var env pkgtypes.APIResponse
	if err := json.Unmarshal(respBytes, &env); err != nil {
		// Not an envelope — treat whole body as data for backward compat.
		if result != nil {
			return json.Unmarshal(respBytes, result)
		}
		return nil
	}

	if !env.Success && env.Message != "" {
		return fmt.Errorf("%s", env.Message)
	}

	if result != nil && env.Data != nil {
		b, err := json.Marshal(env.Data)
		if err != nil {
			return fmt.Errorf("re-marshal envelope data: %w", err)
		}
		return json.Unmarshal(b, result)
	}

	return nil
}
