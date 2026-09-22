-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3308
-- Generation Time: Sep 12, 2026 at 08:03 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `gas_system`
--

-- --------------------------------------------------------

--
-- Table structure for table `admin`
--

CREATE TABLE `admin` (
  `admin_id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `name` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `admin`
--

INSERT INTO `admin` (`admin_id`, `username`, `password`, `name`) VALUES
(1, 'admin', '1234', 'ผู้ดูแลระบบ'),
(2, 'manager', '5678', 'ผู้จัดการ'),
(3, 'superadmin', '9999', 'หัวหน้าผู้ดูแล');

-- --------------------------------------------------------

--
-- Table structure for table `customers`
--

CREATE TABLE `customers` (
  `customer_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `address` text DEFAULT NULL,
  `map_pin` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `customers`
--

INSERT INTO `customers` (`customer_id`, `name`, `phone`, `address`, `map_pin`) VALUES
(19, 'ฟ้าลดา', '014451567496', 'กรุงเทพ', '125.66.5872'),
(20, 'ไท', '0412365555', 'กรุงเทพ', '153.6255'),
(18, '๋JJ', '07591111', 'pangnga', '156.359.257'),
(15, 'Lose', '084517111', 'กรุงเทพ', '18323.822.15555'),
(21, 'ไก่', '08455511355', 'กรุวงเทพ', '125.531.5222'),
(34, 'ฟ้า', '0854563254', 'เพชรหึงษ์ 2', ''),
(29, 'D', '08552321', 'กรุงเทพ', '152.365.323'),
(23, 'Din', '085555555', 'กรุงเทพ', '1555.55555'),
(35, 'ฟ้าลดา', '0859874563', 'เพชรหึงษ์ 3', ''),
(28, 'Grace', '08646515498', 'ภูเก็ต', '1556.513'),
(2, 'Gas', '08654628', 'phuket', '8484187'),
(7, 'LungF', '086548651', 'aaaaaa', 'aaaaaaa'),
(30, 'การ์น', '0866515916', 'กรุงเทพ', '13.546541'),
(8, 'ข้าว', '086846510', 'ฟหกผปแไ', 'ฟผปแฟไกฟปผแ'),
(13, '15984', '08689405871', 'asdas', 'dasdasd'),
(1, 'Kang', '08694052365', 'ภูเก็ต', '4984321654984'),
(14, 'Nice', '0869551388', 'ภูเก็ต', 'ภูเก็ตเมือง'),
(12, 'DKUB', '089656548', 'aaaa', 'aaaaaa'),
(36, 'pp', '0898745656', 'ล็อกเอาต์ แล้วล็อกอินด้วยบัญชี Admin', ''),
(27, 'a', '1828989744875487', 'sd', '152.441474'),
(10, 'จันทร์', '5108435198', 'หำ', '3621684'),
(6, 'asda', 'asd', 'asd', 'asd'),
(25, '4444', 'ฟฟฟฟ', 'ฟ', '11111.5555'),
(22, 'หหห', 'ฟหก', 'ฟหกฟ', 'หก'),
(24, 'หหหห', 'หหหห', 'หหหห', 'หหห');

-- --------------------------------------------------------

--
-- Table structure for table `deliveries`
--

CREATE TABLE `deliveries` (
  `delivery_id` int(11) NOT NULL,
  `serial_number` varchar(100) DEFAULT NULL,
  `customer_name` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `map_pin` varchar(255) DEFAULT NULL,
  `brand` varchar(50) DEFAULT NULL,
  `gas_type` varchar(50) DEFAULT 'LPG',
  `size` varchar(20) DEFAULT NULL,
  `staff_id` int(11) DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `proof_image_path` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `deliveries`
--

INSERT INTO `deliveries` (`delivery_id`, `serial_number`, `customer_name`, `phone`, `address`, `map_pin`, `brand`, `gas_type`, `size`, `staff_id`, `status`, `proof_image_path`, `created_at`) VALUES
(2, NULL, 'สมชาย การค้า', '0812345678', '123/45 ถ.สุขุมวิท กรุงเทพฯ', '13.7563,100.5018', 'PTT', 'LPG', '15 กก.', 1, 'pending', NULL, '2026-08-31 12:38:44'),
(3, NULL, 'ร้านอาหารแม่ยอม', '0898765432', '88 หมู่ 3 ต.ในเมือง อ.เมือง', '-', 'World Gas', 'LPG', '48 กก.', 2, 'success', NULL, '2026-08-31 12:38:44'),
(4, NULL, 'บริษัท ไทยกลาส จำกัด', '029998888', '555 อุตสาหกรรมบางปู สมุทรปราการ', '13.5412,100.6234', 'Unique Gas', 'N2O', '36 กก.', 4, 'pending', NULL, '2026-08-31 12:38:44'),
(5, NULL, 'วิชัย บริการ', '0861112233', '12/1 หมู่บ้านสวนหลวง กรุงเทพฯ', '-', 'PTT', 'LPG', '15 กก.', 1, 'success', 'proof_6aa12d21b01979.13398703.png', '2026-08-31 12:38:44'),
(6, NULL, 'โรงงานแก้วพัฒนา', '023456789', '99/1 บางพลี สมุทรปราการ', '13.6123,100.7123', 'World Gas', 'O2', '48 กก.', 2, 'pending', NULL, '2026-08-31 12:38:44'),
(7, 'SN-3004', 'คุณนภา ลิขิต', '0845556677', '432 ซอยลาดพร้าว 101 กรุงเทพฯ', '-', 'Unique Gas', 'LPG', '7 กก.', 1, 'delivering', NULL, '2026-08-31 12:38:44'),
(8, NULL, 'ร้านเบเกอรี่โฮมเมด', '0839991122', '77 ถนนสีลม กรุงเทพฯ', '13.7234,100.5289', 'PTT', 'LPG', '15 กก.', 1, 'success', 'proof_6aa1217293b743.17317853.png', '2026-08-31 12:38:44'),
(9, 'SN-8003', 'คลินิกทันตกรรมสมบูรณ์', '028887766', '50/2 ถ.พหลโยธิน กรุงเทพฯ', '-', 'Siam Gas', 'N2O', '15 กก.', 1, 'success', 'proof_6aa5829d557972.07007668.png', '2026-08-31 12:38:44'),
(10, NULL, 'ร้านหมูกระทะ ชาบูชิ', '0874445566', '101/5 ถ.พระราม 2 กรุงเทพฯ', '13.6512,100.4321', 'PTT', 'LPG', '48 กก.', 1, 'success', 'proof_6a965242331762.43356366.png', '2026-08-31 12:38:44'),
(11, NULL, 'ฟ้า', '0822222222', 'ฟพะ่ไะัาไะัรา', '', 'PTT', 'LPG', '15 กก.', 1, 'success', NULL, '2026-09-09 12:06:16'),
(15, NULL, 'ฟ้าลดา', '014451567496', 'กรุงเทพ', '125.66.5872', 'PTT', 'LPG', '14', 1, 'success', 'proof_6aa2af6305b5a8.15312240.png', '2026-09-10 08:24:59'),
(16, NULL, 'Grace', '08646515498', 'ภูเก็ต', '1556.513', 'PTT', 'LPG', '14', 4, 'success', 'proof_6aa2b4be59bb11.01730526.png', '2026-09-10 13:25:08'),
(101, 'SN-3001', 'สมชาย การค้า', NULL, '123/45 ถ.สุขุมวิท เขตวัฒนา กรุงเทพฯ 10110', NULL, NULL, 'LPG', NULL, NULL, 'success', NULL, '2026-09-01 02:00:00'),
(102, 'SN-3002', 'ร้านอาหารแซ่บเวอร์', NULL, '88 หมู่ 3 ต.บางพูน อ.เมือง จ.ปทุมธานี', NULL, NULL, 'LPG', NULL, NULL, 'success', NULL, '2026-09-02 02:30:00'),
(103, 'SN-3003', 'ภัตตาคารเจริญกรุง', NULL, '456 ถ.เจริญกรุง เขตสัมพันธวงศ์ กรุงเทพฯ 10100', NULL, NULL, 'LPG', NULL, NULL, 'success', NULL, '2026-09-03 04:00:00'),
(104, 'SN-3004', 'ก๋วยเตี๋ยวเรือนายเอก', NULL, '12/9 ถ.พหลโยธิน อ.คลองหลวง จ.ปทุมธานี', NULL, NULL, 'LPG', NULL, NULL, 'success', NULL, '2026-09-04 01:15:00'),
(105, NULL, 'คุณวิภาวรรณ', NULL, '99/12 หมู่บ้านศุภาลัย ถ.รามอินทรา กรุงเทพฯ 10220', NULL, NULL, 'LPG', NULL, NULL, 'success', NULL, '2026-09-05 06:30:00'),
(106, NULL, 'โรงงานไทยอุตสาหกรรม', NULL, '77 นิคมอุตสาหกรรมบางปู จ.สมุทรปราการ', NULL, NULL, 'LPG', NULL, NULL, 'success', NULL, '2026-09-06 03:00:00'),
(107, NULL, 'ร้านเบเกอรี่อบอุ่น', NULL, '33/4 ถ.เพชรบุรี เขตราชเทวี กรุงเทพฯ 10400', NULL, NULL, 'LPG', NULL, NULL, 'success', NULL, '2026-09-07 01:30:00'),
(108, NULL, 'โรงแรมสยามริเวอร์', NULL, '555 ถ.พระราม 3 เขตยานนาวา กรุงเทพฯ 10120', NULL, NULL, 'LPG', NULL, NULL, 'success', NULL, '2026-09-08 04:45:00'),
(109, NULL, 'ชาบูยิ้มหวาน', NULL, '201 ศูนย์การค้าฟิวเจอร์พาร์ค รังสิต จ.ปทุมธานี', NULL, NULL, 'LPG', NULL, NULL, 'success', NULL, '2026-09-09 02:15:00'),
(110, NULL, 'คุณสมศักดิ์ พรหมมี', NULL, '44/1 ซ.ลาดพร้าว 101 เขตบางกะปิ กรุงเทพฯ 10240', NULL, NULL, 'LPG', NULL, NULL, 'success', NULL, '2026-09-10 05:00:00'),
(112, NULL, 'วิภาดา วงศ์ใหญ่', NULL, '88/9 หมู่ 3 ต.บางกระสอ นนทบุรี', NULL, 'WORLDGAS', 'LPG', '15 กก.', NULL, 'success', NULL, '2022-05-10 07:15:00'),
(115, NULL, 'อารียา สุขสันต์', NULL, '99/1 ถ.รัชดาภิเษก กทม.', NULL, 'ปตท.', 'LPG', '15 กก.', NULL, 'success', NULL, '2025-02-10 01:30:00'),
(116, NULL, 'ณัฐพล มั่นคง', NULL, '55/4 ซอยลาดพร้าว 71 กทม.', NULL, 'WORLDGAS', 'LPG', '15 กก.', NULL, 'success', NULL, '2025-06-18 06:20:00'),
(117, NULL, 'โรงแรมสยามธานี', NULL, '789 ถ.เพชรบุรี กทม.', NULL, 'ปตท.', 'LPG', '48 กก.', NULL, 'success', NULL, '2026-01-05 03:00:00'),
(118, NULL, 'ร้านก๋วยเตี๋ยวรสเด็ด', NULL, '101 ถ.พระราม 2 กทม.', NULL, 'สยามแก๊ส', 'LPG', '15 กก.', NULL, 'success', NULL, '2026-04-12 08:10:00'),
(119, NULL, 'ประวิทย์ ศรีสุข', NULL, '33/7 ถ.จรัญสนิทวงศ์ กทม.', NULL, 'ปตท.', 'LPG', '15 กก.', 1, 'success', 'proof_6aa57e0c0a3648.04211315.png', '2026-09-10 02:00:00'),
(120, NULL, 'ธนากร เลิศรัตน์', NULL, '214 ซอยสุขุมวิท 55 กทม.', NULL, 'WORLDGAS', 'LPG', '4 กก.', 1, 'success', 'proof_6aa577e8bd6b03.58572461.png', '2026-09-12 04:30:00');

-- --------------------------------------------------------

--
-- Table structure for table `delivery_staff`
--

CREATE TABLE `delivery_staff` (
  `staff_id` int(11) NOT NULL,
  `staff_name` varchar(100) DEFAULT NULL,
  `staff_phone` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `delivery_count` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `delivery_staff`
--

INSERT INTO `delivery_staff` (`staff_id`, `staff_name`, `staff_phone`, `address`, `username`, `password`, `status`, `delivery_count`) VALUES
(1, 'สมชาย ใจดี', '0812345678', 'เชียงใหม่', 'somchai', '12345', 'active', 7),
(2, 'สมหญิง พูนสุข', '0898765435', 'ลำปาง', 'somying', '5555525', 'active', 1),
(3, 'วีระชัย ทองคำ', '0821112233', 'กรุงเทพ', 'weerachai', '9999', 'inactive', 0),
(4, 'ภูษณิศา จันทร์นวล', '0822153045', '26/39 ม.9 เพชรหงษ์ 2 ต.ทรงคนอง', 'pimlypire', '9632', 'active', 1),
(5, 'ยย', '0822222222', 'รจบรสนร้ส', 'ยนวีนยว', '9652', 'active', 0),
(6, 'yuu', '0825632541', 'sshjstyafbDFhatja', 'aeah', '96396', 'active', 0);

-- --------------------------------------------------------

--
-- Table structure for table `gas_brands`
--

CREATE TABLE `gas_brands` (
  `id` int(11) NOT NULL,
  `brand_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `gas_brands`
--

INSERT INTO `gas_brands` (`id`, `brand_name`) VALUES
(16, 'PTT'),
(18, 'Siam Gas'),
(19, 'Unique Gas'),
(17, 'WORLDGAS'),
(15, 'ข้าวหอม'),
(1, 'ปตท.'),
(5, 'พีที (PT Gas)'),
(4, 'ยูนิคแก๊ส'),
(3, 'สยามแก๊ส'),
(2, 'เวิลด์แก๊ส');

-- --------------------------------------------------------

--
-- Table structure for table `gas_cylinder`
--

CREATE TABLE `gas_cylinder` (
  `serial_number` varchar(100) NOT NULL,
  `status` varchar(50) DEFAULT NULL,
  `size` varchar(50) DEFAULT NULL,
  `manufacture_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `qr_code` text DEFAULT NULL,
  `brand` varchar(50) DEFAULT NULL,
  `gas_type` varchar(50) DEFAULT NULL,
  `last_check_date` date DEFAULT NULL,
  `next_check_date` date DEFAULT NULL,
  `delivered_date` date DEFAULT NULL,
  `current_location` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `import_date` date DEFAULT curdate(),
  `next_inspection_date` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `gas_cylinder`
--

INSERT INTO `gas_cylinder` (`serial_number`, `status`, `size`, `manufacture_date`, `expiry_date`, `qr_code`, `brand`, `gas_type`, `last_check_date`, `next_check_date`, `delivered_date`, `current_location`, `created_at`, `updated_at`, `import_date`, `next_inspection_date`) VALUES
('5641654', 'กำลังส่ง', '4 กก.', NULL, '2036-09-03', NULL, 'WORLDGAS', 'LPG', NULL, '2031-09-03', NULL, 'กำลังจัดส่ง', '2026-09-12 16:02:38', '2026-09-12 16:03:40', '2026-09-12', NULL),
('564651354', 'ในคลัง', '15 kg', NULL, NULL, NULL, 'เวิลด์แก๊ส', 'LPG', NULL, NULL, NULL, 'คลังแก๊ส', '2026-09-12 14:48:34', '2026-09-12 14:48:34', '2026-09-12', '2031-09-12'),
('6003', 'กำลังส่ง', '14', '2026-09-09', '2036-09-09', NULL, 'PTT', 'LPG', NULL, '2031-09-09', NULL, 'กำลังจัดส่ง', '2026-09-10 12:45:32', '2026-09-10 12:57:36', '2026-09-12', NULL),
('8525', 'กำลังส่ง', '14', NULL, '2036-09-02', NULL, 'PTT', 'LPG', NULL, '2031-09-02', NULL, 'กำลังจัดส่ง', '2026-09-10 13:43:53', '2026-09-10 13:46:21', '2026-09-12', NULL),
('8976546', 'ในคลัง', '4 กก.', NULL, NULL, NULL, 'ปตท.', 'LPG', NULL, NULL, NULL, 'คลังแก๊ส', '2026-09-12 16:04:34', '2026-09-12 16:04:34', '2026-09-12', '2031-09-12'),
('asd', 'ในคลัง', '15 กก.', '2026-05-04', '2036-05-04', '', 'PTT', 'LPG', '2026-05-17', '2027-08-29', NULL, 'คลัง', '2026-05-17 08:14:26', '2026-09-12 10:29:17', '2026-09-12', NULL),
('dsdhywrt', 'กำลังส่ง', '14', '2026-08-01', '2036-08-01', '', 'พีที (PT Gas)', 'NGV', '2026-08-08', '2027-08-29', NULL, 'คลัง', '2026-08-08 17:49:14', '2026-09-09 11:40:45', '2026-09-12', NULL),
('etyketk', 'ปกติ', '36 กก.', '2026-08-01', '2036-08-01', '', 'พีที (PT Gas)', 'LPG', '2026-08-08', '2027-08-29', NULL, 'พะเยา', '2026-08-08 17:50:42', '2026-09-09 11:40:55', '2026-09-12', NULL),
('serhths', 'กำลังส่ง', '15 กก.', '2026-08-01', '2036-08-01', '', 'PTT', 'LPG', '2026-08-08', '2027-08-29', NULL, 'กำลังจัดส่ง', '2026-08-08 16:19:18', '2026-09-09 09:05:47', '2026-09-12', NULL),
('SN-1001', 'กำลังจัดส่ง', '99 kg', '2022-01-10', '2032-01-10', '', 'พีที (PT Gas)', 'NGV', '2025-05-01', '2027-09-10', '2025-01-15', 'คลัง', '2026-05-08 20:24:47', '2026-09-10 12:46:06', '2026-09-12', NULL),
('SN-1002', 'กำลังส่ง', '15 กก.', '2021-03-12', '2031-03-12', '', 'PTT', 'LPG', '2025-04-15', '2027-09-10', NULL, 'กำลังจัดส่ง', '2026-05-08 20:24:47', '2026-09-10 12:46:06', '2026-09-12', NULL),
('SN-3001', 'จัดส่งสำเร็จ', '15kg', NULL, NULL, NULL, 'PTT', NULL, NULL, '2027-08-10', '2026-09-01', 'คลังสินค้า A', '2026-08-10 14:16:06', '2026-09-12 17:29:48', '2026-09-12', NULL),
('SN-3002', 'จัดส่งสำเร็จ', '15kg', NULL, NULL, NULL, 'World Gas', NULL, NULL, '2027-08-11', '2026-09-02', 'ร้านค้าสาขา 1', '2026-08-10 14:16:06', '2026-09-12 17:29:48', '2026-09-12', NULL),
('SN-3003', 'จัดส่งสำเร็จ', '15 กก.', '2026-09-04', '2036-09-04', '', 'Siam Gas', 'N2O', NULL, '2031-09-04', '2026-09-03', 'คลังสินค้า B', '2026-08-10 14:16:06', '2026-09-12 17:29:48', '2026-09-12', NULL),
('SN-3004', 'จัดส่งสำเร็จ', '7 กก.', '2026-09-02', '2036-09-02', '', 'Unique Gas', 'LPG', NULL, '2031-09-02', '2026-09-04', 'กำลังจัดส่ง', '2026-08-10 14:16:06', '2026-09-12 17:29:48', '2026-09-12', NULL),
('SN-56498416', 'ในคลัง', '4 kg', '2026-09-01', '2036-09-01', NULL, 'WORLDGAS', 'LPG', NULL, '2031-09-01', NULL, 'คลังสินค้า A', '2026-09-12 15:53:43', '2026-09-12 15:53:43', '2026-09-12', NULL),
('SN-8001', 'กำลังส่ง', '15 กก.', '2026-09-15', '2036-09-15', '', 'ปตท.', 'LPG', NULL, '2031-09-15', NULL, 'กำลังจัดส่ง', '2026-08-10 14:19:20', '2026-09-12 16:25:33', '2026-09-12', NULL),
('SN-8002', 'ใช้งานอยู่', '15kg', NULL, NULL, NULL, 'World Gas', NULL, NULL, '2026-08-01', NULL, 'ร้านค้าสาขา 1', '2026-08-10 14:19:20', '2026-08-10 14:29:29', '2026-09-12', NULL),
('SN-8003', 'จัดส่งสำเร็จ', '15 กก.', '2026-09-01', '2036-09-01', '', 'Siam Gas', 'N2O', NULL, '2031-09-01', '2026-08-31', 'กำลังจัดส่ง', '2026-08-10 14:19:20', '2026-09-12 17:29:48', '2026-09-12', NULL),
('SN-TEMP-CYL-2026091015392657', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-10 13:39:26', '2026-09-12 13:18:03', '2026-09-12', NULL),
('SN-TEMP-CYL-2026091015393157', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-10 13:39:31', '2026-09-12 13:18:03', '2026-09-12', NULL),
('SN-TEMP-CYL-2026091015401054', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-10 13:40:10', '2026-09-12 13:18:03', '2026-09-12', NULL),
('SN-TEMP-CYL-2026091015402877', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-10 13:40:28', '2026-09-12 13:18:03', '2026-09-12', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `gas_locations`
--

CREATE TABLE `gas_locations` (
  `id` int(11) NOT NULL,
  `location_name` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `gas_locations`
--

INSERT INTO `gas_locations` (`id`, `location_name`) VALUES
(1, 'พะเยา'),
(2, 'เชียงราย'),
(3, 'คลัง');

-- --------------------------------------------------------

--
-- Table structure for table `gas_sensor_logs`
--

CREATE TABLE `gas_sensor_logs` (
  `id` int(11) NOT NULL,
  `gas_value` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `gas_sensor_logs`
--

INSERT INTO `gas_sensor_logs` (`id`, `gas_value`, `created_at`) VALUES
(1, 450, '2026-08-31 11:22:32'),
(2, 480, '2026-08-31 11:22:32'),
(3, 510, '2026-08-31 11:22:32'),
(4, 530, '2026-08-31 11:22:32'),
(5, 490, '2026-08-31 11:22:32'),
(6, 500, '2026-08-31 11:22:32'),
(7, 520, '2026-08-31 11:22:32'),
(8, 470, '2026-08-31 11:22:32'),
(9, 515, '2026-08-31 11:22:32'),
(10, 505, '2026-08-31 11:22:32'),
(11, 450, '2026-08-31 11:26:32'),
(12, 480, '2026-08-31 11:26:32'),
(13, 510, '2026-08-31 11:26:32'),
(14, 530, '2026-08-31 11:26:32'),
(15, 490, '2026-08-31 11:26:32'),
(16, 500, '2026-08-31 11:26:32'),
(17, 520, '2026-08-31 11:26:32'),
(18, 470, '2026-08-31 11:26:32'),
(19, 515, '2026-08-31 11:26:32'),
(20, 505, '2026-08-31 11:26:32');

-- --------------------------------------------------------

--
-- Table structure for table `gas_sizes`
--

CREATE TABLE `gas_sizes` (
  `id` int(11) NOT NULL,
  `size_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `gas_sizes`
--

INSERT INTO `gas_sizes` (`id`, `size_name`) VALUES
(1, '11.5 กก.'),
(10, '14'),
(2, '15 kg'),
(12, '15 กก.'),
(7, '36 kg.'),
(8, '36 กก.'),
(13, '4 กก.'),
(3, '48 kg'),
(14, '7 กก.'),
(11, '99'),
(9, '99 kg');

-- --------------------------------------------------------

--
-- Table structure for table `gas_statuses`
--

CREATE TABLE `gas_statuses` (
  `id` int(11) NOT NULL,
  `status_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `gas_statuses`
--

INSERT INTO `gas_statuses` (`id`, `status_name`) VALUES
(1, 'ในคลัง'),
(2, 'กำลังส่ง'),
(3, 'ปกติ'),
(4, 'รอซ่อม'),
(5, 'ชำรุด');

-- --------------------------------------------------------

--
-- Table structure for table `gas_types`
--

CREATE TABLE `gas_types` (
  `id` int(11) NOT NULL,
  `type_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `gas_types`
--

INSERT INTO `gas_types` (`id`, `type_name`) VALUES
(9, 'CP'),
(1, 'LPG'),
(10, 'N2O'),
(8, 'NGV');

-- --------------------------------------------------------

--
-- Table structure for table `maintenance`
--

CREATE TABLE `maintenance` (
  `maintenance_id` int(11) NOT NULL,
  `serial_number` varchar(100) DEFAULT NULL,
  `maintenance_date` date DEFAULT NULL,
  `description` text DEFAULT NULL,
  `maintenance_type` varchar(100) DEFAULT NULL,
  `result` text DEFAULT NULL,
  `next_action` varchar(255) DEFAULT NULL,
  `next_maintenance_date` date DEFAULT NULL,
  `cylinder_id` int(11) DEFAULT NULL,
  `admin_id` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `maintenance`
--

INSERT INTO `maintenance` (`maintenance_id`, `serial_number`, `maintenance_date`, `description`, `maintenance_type`, `result`, `next_action`, `next_maintenance_date`, `cylinder_id`, `admin_id`, `created_at`) VALUES
(30, 'dsdhywrt', '2026-08-29', 'สภาพสมบูรณ์ พร้อมใช้งาน', 'ตรวจสภาพ', 'ผ่าน', 'ใช้งานต่อได้ (ปกติ)', NULL, NULL, NULL, '2026-08-29 23:45:03'),
(31, 'serhths', '2026-08-29', 'สภาพสมบูรณ์ พร้อมใช้งาน', 'ตรวจสภาพ', 'ผ่าน', 'ใช้งานต่อได้ (ปกติ)', NULL, NULL, NULL, '2026-08-29 23:45:03'),
(32, 'etyketk', '2026-08-29', 'สภาพสมบูรณ์ พร้อมใช้งาน', 'ตรวจสภาพ', 'ผ่าน', 'ใช้งานต่อได้ (ปกติ)', NULL, NULL, NULL, '2026-08-29 23:45:03'),
(33, 'asd', '2026-08-29', 'สภาพสมบูรณ์ พร้อมใช้งาน', 'ตรวจสภาพ', 'ผ่าน', 'ใช้งานต่อได้ (ปกติ)', NULL, NULL, NULL, '2026-08-29 23:45:03'),
(34, 'SN-3003', '2026-09-10', '[สิ่งที่ต้องทำต่อ: ใช้งานต่อได้ (ปกติ)] [หมายเหตุ: สภาพสมบูรณ์ พร้อมใช้งาน]', 'ตรวจสภาพ', 'ผ่าน', NULL, NULL, NULL, NULL, '2026-09-10 19:07:07'),
(35, 'SN-3004', '2026-09-10', '[สิ่งที่ต้องทำต่อ: ใช้งานต่อได้ (ปกติ)] [หมายเหตุ: สภาพสมบูรณ์ พร้อมใช้งาน]', 'ตรวจสภาพ', 'ผ่าน', NULL, NULL, NULL, NULL, '2026-09-10 19:07:07'),
(36, 'SN-1001', '2026-09-10', '[สิ่งที่ต้องทำต่อ: ใช้งานต่อได้ (ปกติ)] [หมายเหตุ: สภาพสมบูรณ์ พร้อมใช้งาน]', 'ตรวจสภาพ', 'ผ่าน', NULL, NULL, NULL, NULL, '2026-09-10 19:46:06'),
(37, 'SN-1002', '2026-09-10', '[สิ่งที่ต้องทำต่อ: ใช้งานต่อได้ (ปกติ)] [หมายเหตุ: สภาพสมบูรณ์ พร้อมใช้งาน]', 'ตรวจสภาพ', 'ผ่าน', NULL, NULL, NULL, NULL, '2026-09-10 19:46:06');

-- --------------------------------------------------------

--
-- Table structure for table `maintenance_options`
--

CREATE TABLE `maintenance_options` (
  `option_id` int(11) NOT NULL,
  `option_category` varchar(50) NOT NULL,
  `option_value` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `maintenance_options`
--

INSERT INTO `maintenance_options` (`option_id`, `option_category`, `option_value`) VALUES
(1, 'type', 'ตรวจสภาพ'),
(2, 'type', 'บำรุงรักษา'),
(3, 'type', 'ซ่อมแซม'),
(4, 'result', 'ผ่าน'),
(5, 'result', 'ไม่ผ่าน'),
(6, 'result', 'รอผลตรวจ'),
(7, 'action', 'ใช้งานต่อได้ (ปกติ)'),
(8, 'action', 'สมควรบำรุงรักษาต่อ'),
(9, 'action', 'ส่งซ่อมแซมด่วน'),
(10, 'action', 'ส่งทดสอบ Hydrostatic'),
(11, 'action', 'ปลดตระกูล / จำหน่ายออก'),
(12, 'note', 'สภาพสมบูรณ์ พร้อมใช้งาน'),
(13, 'note', 'วาล์วชำรุด สมควรเปลี่ยนวาล์ว'),
(14, 'note', 'ตัวถังมีรอยบุบ/สนิม ต้องบำรุงรักษา');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `admin`
--
ALTER TABLE `admin`
  ADD PRIMARY KEY (`admin_id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- Indexes for table `customers`
--
ALTER TABLE `customers`
  ADD PRIMARY KEY (`phone`);

--
-- Indexes for table `deliveries`
--
ALTER TABLE `deliveries`
  ADD PRIMARY KEY (`delivery_id`),
  ADD KEY `fk_deliv_gas_cyl_new` (`serial_number`),
  ADD KEY `fk_deliv_staff_new` (`staff_id`);

--
-- Indexes for table `delivery_staff`
--
ALTER TABLE `delivery_staff`
  ADD PRIMARY KEY (`staff_id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- Indexes for table `gas_brands`
--
ALTER TABLE `gas_brands`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `brand_name` (`brand_name`);

--
-- Indexes for table `gas_cylinder`
--
ALTER TABLE `gas_cylinder`
  ADD PRIMARY KEY (`serial_number`) USING BTREE;

--
-- Indexes for table `gas_locations`
--
ALTER TABLE `gas_locations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `gas_sensor_logs`
--
ALTER TABLE `gas_sensor_logs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `gas_sizes`
--
ALTER TABLE `gas_sizes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `size_name` (`size_name`);

--
-- Indexes for table `gas_statuses`
--
ALTER TABLE `gas_statuses`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `gas_types`
--
ALTER TABLE `gas_types`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `type_name` (`type_name`);

--
-- Indexes for table `maintenance`
--
ALTER TABLE `maintenance`
  ADD PRIMARY KEY (`maintenance_id`),
  ADD KEY `cylinder_id` (`cylinder_id`),
  ADD KEY `admin_id` (`admin_id`),
  ADD KEY `fk_maint_gas_cylinder` (`serial_number`);

--
-- Indexes for table `maintenance_options`
--
ALTER TABLE `maintenance_options`
  ADD PRIMARY KEY (`option_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `admin`
--
ALTER TABLE `admin`
  MODIFY `admin_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `deliveries`
--
ALTER TABLE `deliveries`
  MODIFY `delivery_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=121;

--
-- AUTO_INCREMENT for table `delivery_staff`
--
ALTER TABLE `delivery_staff`
  MODIFY `staff_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `gas_brands`
--
ALTER TABLE `gas_brands`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `gas_locations`
--
ALTER TABLE `gas_locations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `gas_sensor_logs`
--
ALTER TABLE `gas_sensor_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT for table `gas_sizes`
--
ALTER TABLE `gas_sizes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `gas_statuses`
--
ALTER TABLE `gas_statuses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `gas_types`
--
ALTER TABLE `gas_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `maintenance`
--
ALTER TABLE `maintenance`
  MODIFY `maintenance_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=38;

--
-- AUTO_INCREMENT for table `maintenance_options`
--
ALTER TABLE `maintenance_options`
  MODIFY `option_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `deliveries`
--
ALTER TABLE `deliveries`
  ADD CONSTRAINT `fk_deliv_gas_cyl_new` FOREIGN KEY (`serial_number`) REFERENCES `gas_cylinder` (`serial_number`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_deliv_staff_new` FOREIGN KEY (`staff_id`) REFERENCES `delivery_staff` (`staff_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_deliveries_delivery_staff` FOREIGN KEY (`staff_id`) REFERENCES `delivery_staff` (`staff_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_deliveries_gas_cylinder` FOREIGN KEY (`serial_number`) REFERENCES `gas_cylinder` (`serial_number`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `maintenance`
--
ALTER TABLE `maintenance`
  ADD CONSTRAINT `fk_maint_gas_cylinder` FOREIGN KEY (`serial_number`) REFERENCES `gas_cylinder` (`serial_number`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `maintenance_ibfk_2` FOREIGN KEY (`admin_id`) REFERENCES `admin` (`admin_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
