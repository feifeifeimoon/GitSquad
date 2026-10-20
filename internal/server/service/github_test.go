package service

import (
	"crypto/rand"
	"crypto/rsa"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// GitHub rejects an App JWT whose exp is more than 10 minutes out, measured
// against GitHub's own clock. A token signed at exactly +10m fails on a
// machine whose clock is a little fast, which is how installation-token
// creation started returning 401 locally.
func TestAppTokenSourceUsesClockSafeWindow(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	src := &appTokenSource{appID: 12345, privateKey: key}
	tok, err := src.Token()
	if err != nil {
		t.Fatal(err)
	}
	parsed, _, err := jwt.NewParser().ParseUnverified(tok.AccessToken, jwt.MapClaims{})
	if err != nil {
		t.Fatal(err)
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatalf("claims type = %T, want jwt.MapClaims", parsed.Claims)
	}

	now := time.Now().Unix()
	iat := int64(claims["iat"].(float64))
	exp := int64(claims["exp"].(float64))
	iss := int64(claims["iss"].(float64))

	if iss != 12345 {
		t.Fatalf("iss = %d, want 12345", iss)
	}
	if iat > now {
		t.Fatalf("iat = %d is in the future (now %d)", iat, now)
	}
	if exp-now > int64(9*time.Minute/time.Second) {
		t.Fatalf("exp is %s out, want <= 9m", time.Duration(exp-now)*time.Second)
	}
	if exp-iat > int64(10*time.Minute/time.Second) {
		t.Fatalf("token window is %s, want <= 10m", time.Duration(exp-iat)*time.Second)
	}
	if exp <= now {
		t.Fatalf("exp = %d is not in the future (now %d)", exp, now)
	}
}
