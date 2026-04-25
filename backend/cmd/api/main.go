package main

import (
	"log"

	"diaryapp/backend/internal/app"
	"diaryapp/backend/internal/config"
	"diaryapp/backend/internal/models"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func main() {
	cfg := config.Load()
	db, err := gorm.Open(mysql.Open(cfg.DatabaseDSN), &gorm.Config{})
	if err != nil {
		log.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Entry{}, &models.Attachment{}); err != nil {
		log.Fatal(err)
	}
	if err := app.NewRouter(db, cfg).Run(cfg.Addr); err != nil {
		log.Fatal(err)
	}
}
