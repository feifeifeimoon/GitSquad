package main

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/feifeifeimoon/GitSquad/internal/server/router"
)

func main() {
	fmt.Println("GitSquad Server Start")
	server := &http.Server{
		Addr:    ":8080",
		Handler: router.New(),
	}

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		panic(err)
	}
}
