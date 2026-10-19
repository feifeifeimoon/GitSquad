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
		{"首席架构师", "首席架构师", nil},
		{" 首席架构师 ", "首席架构师", nil},
		{"架构师-1", "架构师-1", nil},
		{"", "", ErrInvalidAgentName},
		{"bad name", "", ErrInvalidAgentName},
		{"首席 架构师", "", ErrInvalidAgentName},
		{"架构师！", "", ErrInvalidAgentName},
		{"-lead", "", ErrInvalidAgentName},
	}
	for _, c := range cases {
		got, err := normalizeAgentName(c.in)
		if err != c.err || got != c.want {
			t.Errorf("normalizeAgentName(%q) = (%q, %v), want (%q, %v)", c.in, got, err, c.want, c.err)
		}
	}
}

func TestNormalizeHeadShape(t *testing.T) {
	cases := []struct {
		in   string
		want string
		err  error
	}{
		{"", defaultHeadShape, nil},
		{"gitsquad", "gitsquad", nil},
		{" Circle ", "circle", nil},
		{"square", "square", nil},
		{"hexagon", "hexagon", nil},
		{"rectangle", "rectangle", nil},
		{"pentagon", "", ErrInvalidHeadShape},
		{"git squad", "", ErrInvalidHeadShape},
	}
	for _, c := range cases {
		got, err := normalizeHeadShape(c.in)
		if err != c.err || got != c.want {
			t.Errorf("normalizeHeadShape(%q) = (%q, %v), want (%q, %v)", c.in, got, err, c.want, c.err)
		}
	}
}
