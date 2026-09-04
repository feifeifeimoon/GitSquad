package service

import "testing"

func TestNormalizeAgentName(t *testing.T) {
	cases := []struct {
		in   string
		want string
		err  error
	}{
		{"coder", "coder", nil},
		{" Coder ", "coder", nil},
		{"backend-coder", "backend-coder", nil},
		{"frontend_coder", "frontend_coder", nil},
		{"", "", ErrInvalidAgentName},
		{"bad name", "", ErrInvalidAgentName},
		{"-lead", "", ErrInvalidAgentName},
	}
	for _, c := range cases {
		got, err := normalizeAgentName(c.in)
		if err != c.err || got != c.want {
			t.Errorf("normalizeAgentName(%q) = (%q, %v), want (%q, %v)", c.in, got, err, c.want, c.err)
		}
	}
}
