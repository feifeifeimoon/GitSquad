package ws

import "errors"

var (
	errNotConnected = errors.New("daemon not connected")
	errSendFull     = errors.New("send channel full")
	errConnClosed   = errors.New("connection closed")
)
