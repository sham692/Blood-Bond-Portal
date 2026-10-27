-- MySQL dump 10.13  Distrib 8.0.11, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: blood_bond
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
 SET NAMES utf8 ;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `admins`
--

DROP TABLE IF EXISTS `admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `admins` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admins`
--

LOCK TABLES `admins` WRITE;
/*!40000 ALTER TABLE `admins` DISABLE KEYS */;
INSERT INTO `admins` VALUES (5,'admin','$2b$10$APcztnbYEKjYYmGE2RmzuezPE4zJkjj44.DDszAjL6MyH5EYwjPam','2026-10-24 11:13:47');
/*!40000 ALTER TABLE `admins` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `blood_inventory`
--

DROP TABLE IF EXISTS `blood_inventory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `blood_inventory` (
  `id` int NOT NULL AUTO_INCREMENT,
  `blood_group` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `units_available` int DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `blood_group` (`blood_group`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `blood_inventory`
--

LOCK TABLES `blood_inventory` WRITE;
/*!40000 ALTER TABLE `blood_inventory` DISABLE KEYS */;
INSERT INTO `blood_inventory` VALUES (1,'A+',10),(2,'A-',5),(3,'B+',15),(4,'B-',4),(5,'O+',20),(6,'O-',8),(7,'AB+',6),(8,'AB-',2);
/*!40000 ALTER TABLE `blood_inventory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `blood_requests`
--

DROP TABLE IF EXISTS `blood_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `blood_requests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `patient_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `blood_group` enum('A+','A-','B+','B-','AB+','AB-','O+','O-') COLLATE utf8mb4_unicode_ci NOT NULL,
  `units_needed` smallint unsigned NOT NULL,
  `hospital_name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `urgency_level` enum('Critical','Moderate') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('Pending','Fulfilled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_blood_requests_search` (`status`,`blood_group`,`city`),
  KEY `idx_blood_requests_urgency` (`urgency_level`,`created_at`),
  CONSTRAINT `chk_blood_requests_units` CHECK ((`units_needed` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `blood_requests`
--

LOCK TABLES `blood_requests` WRITE;
/*!40000 ALTER TABLE `blood_requests` DISABLE KEYS */;
INSERT INTO `blood_requests` VALUES (1,'Rahul Sharma','O+',2,'ABC Hospital','Pune','9011067371',NULL,'Critical','Fulfilled','2026-10-24 10:12:50'),(2,'krishna','B+',2,'kt hospitl','karvenager','1231231231',NULL,'Moderate','Fulfilled','2026-10-24 10:48:27'),(3,'sham','B+',2,'kt hospitl','pune','9011067371','and@gmail.com','Moderate','Fulfilled','2026-10-24 12:11:52'),(4,'sham c','AB+',3,'kt hospitl','pune','9011067371','shamchavan4444@gmail.com','Moderate','Fulfilled','2026-10-24 13:11:58');
/*!40000 ALTER TABLE `blood_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `donations`
--

DROP TABLE IF EXISTS `donations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `donations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `donor_id` bigint unsigned DEFAULT NULL,
  `donor_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `blood_group` enum('A+','A-','B+','B-','AB+','AB-','O+','O-') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount_ml` smallint unsigned NOT NULL,
  `units_donated` smallint unsigned NOT NULL DEFAULT '1',
  `units_remaining` smallint unsigned NOT NULL DEFAULT '1',
  `donation_date` date NOT NULL,
  `expiry_date` date GENERATED ALWAYS AS ((`donation_date` + interval 35 day)) STORED,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `camp` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_donations_group_date` (`blood_group`,`donation_date`),
  KEY `idx_donations_date` (`donation_date`),
  KEY `fk_donations_donor` (`donor_id`),
  CONSTRAINT `fk_donations_donor` FOREIGN KEY (`donor_id`) REFERENCES `donors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `donations`
--

LOCK TABLES `donations` WRITE;
/*!40000 ALTER TABLE `donations` DISABLE KEYS */;
INSERT INTO `donations` (`id`, `donor_id`, `donor_name`, `blood_group`, `amount_ml`, `units_donated`, `units_remaining`, `donation_date`, `city`, `camp`, `contact`, `created_at`) VALUES (1,1,'kt','A+',450,1,1,'2026-10-24','pune',NULL,'1233445566','2026-10-24 09:37:23');
/*!40000 ALTER TABLE `donations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `donors`
--

DROP TABLE IF EXISTS `donors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `donors` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `blood_group` enum('A+','A-','B+','B-','AB+','AB-','O+','O-') COLLATE utf8mb4_unicode_ci NOT NULL,
  `age` tinyint unsigned NOT NULL,
  `gender` enum('Male','Female','Other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Other',
  `phone` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount_ml` smallint unsigned NOT NULL,
  `last_donation` date DEFAULT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registered_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_donors_search` (`blood_group`,`city`),
  KEY `idx_donors_registered_at` (`registered_at`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `donors`
--

LOCK TABLES `donors` WRITE;
/*!40000 ALTER TABLE `donors` DISABLE KEYS */;
INSERT INTO `donors` VALUES (1,'kt','A+',21,'Male','1233445566','abcd@gmail.com','pune',200,'2026-10-24','pune','2026-10-24 09:31:08'),(2,'t','A-',18,'Male','1233445566','abc@gmail.com','pune',450,'2026-10-15',NULL,'2026-10-24 10:31:54'),(3,'Test Donor','B+',20,'Male','7972723161','abc@gmail.com','pune',250,'2026-10-24',NULL,'2026-10-24 12:13:20'),(4,'tezt','B+',25,'Male','1233445566',NULL,'pune',450,'2026-10-24',NULL,'2026-10-24 12:17:52'),(5,'ram','B+',45,'Male','1233445566',NULL,'pune',450,NULL,NULL,'2026-10-24 12:32:18'),(6,'rama','B+',36,'Male','1233445566',NULL,'pune',450,NULL,NULL,'2026-10-24 12:35:03'),(7,'kt','B+',23,'Male','1233445566',NULL,'pune',450,NULL,NULL,'2026-10-24 12:39:14'),(8,'ktt','B+',35,'Male','1233445566',NULL,'pune',450,NULL,NULL,'2026-10-24 12:40:41'),(9,'kk','B+',25,'Male','1233445566',NULL,'pune',450,NULL,NULL,'2026-10-24 12:43:37'),(10,'kj','B+',25,'Male','1233445566',NULL,'pune',450,NULL,NULL,'2026-10-24 13:02:00'),(11,'tk','B+',58,'Male','1233445566',NULL,'pune',450,NULL,NULL,'2026-10-24 13:04:30'),(12,'ff','B+',45,'Male','1233445566',NULL,'pune',450,NULL,NULL,'2026-10-24 13:05:55'),(13,'ss','B+',54,'Male','7972723161',NULL,'pune',450,NULL,NULL,'2026-10-24 13:11:00'),(14,'kf','AB+',45,'Male','1233445566',NULL,'pune',450,NULL,NULL,'2026-10-24 13:12:29');
/*!40000 ALTER TABLE `donors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
 SET character_set_client = utf8mb4 ;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `blood_group` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'krishna t','abc@gmail.com','krish12','A+','9876543210','Pune','2026-10-24 09:07:13');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-25 10:16:51
