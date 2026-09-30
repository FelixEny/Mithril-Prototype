// Culture-scoped name pools for the mock community.
//
// The generator allocates each member a culture (proportional to `weight`) and
// then draws a given name + surname from that culture's pools ONLY. This keeps
// full names culturally coherent — an Igbo given name like "Adaeze" never pairs
// with an English surname like "Wood", and a global server reads as genuinely
// global. Ordering is always "Given Surname" for every culture.
//
// Same-token pairings ("Given Given") are filtered by the generator; an exact
// full-name collision across cultures is resolved deterministically at
// generation time via the culture pool's unused combos.
export const CULTURES = [
  {
    id: 'us',
    weight: 600,
    given: ['Adam', 'Adrian', 'Alexander', 'Andre', 'Andrew', 'Anthony', 'Austin', 'Benjamin', 'Brandon', 'Brian', 'Caleb', 'Carlos', 'Carter', 'Christopher', 'Cody', 'Colin', 'Connor', 'Daniel', 'Darius', 'David', 'Derek', 'Devon', 'Dylan', 'Edward', 'Elijah', 'Eric', 'Ethan', 'Gabriel', 'Gavin', 'George', 'Grant', 'Hunter', 'Isaiah', 'Jacob', 'James', 'Jamal', 'Jared', 'Jason', 'Jayden', 'Jeffery', 'Jeremiah', 'Jesse', 'John', 'Jonathan', 'Jordan', 'Joseph', 'Joshua', 'Justin', 'Kaleb', 'Kevin', 'Kyle', 'Landon', 'Logan', 'Lucas', 'Marcus', 'Matthew', 'Michael', 'Miguel', 'Miles', 'Nathan', 'Nicholas', 'Noah', 'Owen', 'Patrick', 'Paul', 'Preston', 'Ryan', 'Samuel', 'Sean', 'Steven', 'Tyler', 'Victor', 'Wesley', 'Zachary'],
    surnames: ['Anderson', 'Bailey', 'Bennett', 'Brooks', 'Brown', 'Butler', 'Campbell', 'Carter', 'Clark', 'Collins', 'Cooper', 'Davis', 'Edwards', 'Evans', 'Foster', 'Garcia', 'Gonzales', 'Green', 'Harris', 'Hayes', 'Hill', 'Howard', 'Hughes', 'Jackson', 'Jenkins', 'Johnson', 'Jones', 'King', 'Lewis', 'Martinez', 'Miller', 'Mitchell', 'Moore', 'Murphy', 'Nelson', 'Parker', 'Perry', 'Price', 'Reed', 'Richardson', 'Robinson', 'Rogers', 'Scott', 'Simmons', 'Smith', 'Taylor', 'Thomas', 'Walker', 'Watson', 'Williams', 'Wilson', 'Wright'],
  },
  {
    id: 'uk',
    weight: 250,
    given: ['Amelia', 'Angus', 'Annabel', 'Arabella', 'Archie', 'Arthur', 'Beatrice', 'Callum', 'Camilla', 'Cara', 'Carys', 'Charlotte', 'Daisy', 'Eleanor', 'Elsie', 'Esme', 'Felicity', 'Finlay', 'Fraser', 'Gemma', 'Georgina', 'Hamish', 'Harriet', 'Hazel', 'Henry', 'Imogen', 'Isla', 'Ivy', 'Jasper', 'Keeley', 'Lachlan', 'Lorna', 'Maisie', 'Maxine', 'Naomi', 'Oliver', 'Oscar', 'Penelope', 'Poppy', 'Primrose', 'Rex', 'Rowan', 'Rupert', 'Scarlett', 'Sophie', 'Stuart', 'Toby', 'Veronica', 'Wilfred', 'Winnie'],
    surnames: ['Adams', 'Ashworth', 'Barker', 'Birch', 'Broadbent', 'Chapman', 'Clarke', 'Crawley', 'Dawson', 'Elliot', 'Faulkner', 'Fielding', 'Griffiths', 'Harding', 'Hartley', 'Hastings', 'Hollis', 'Kirby', 'Mercer', 'Nash', 'Ogden', 'Palmer', 'Payne', 'Quigley', 'Redmond', 'Roe', 'Sheffield', 'Spencer', 'Thorpe', 'Turner', 'Underwood', 'Vance', 'Warburton', 'York'],
  },
  {
    id: 'nigeria',
    weight: 240,
    given: ['Adaeze', 'Adanna', 'Adesuwa', 'Amara', 'Chiagozie', 'Chiamaka', 'Chidera', 'Chika', 'Chinedu', 'Chinwe', 'Chisom', 'Chukwuemeka', 'Efe', 'Ehis', 'Emeka', 'Eniola', 'Ezinne', 'Fatima', 'Femi', 'Funke', 'Hafsat', 'Ifeoma', 'Ijeoma', 'Ikenna', 'Kelechi', 'Kemi', 'Lola', 'Maryam', 'Ngozi', 'Nneka', 'Nnenna', 'Obiageli', 'Ogechi', 'Oluchi', 'Olumide', 'Onyeka', 'Onyinye', 'Seyi', 'Simisola', 'Somto', 'Tanimola', 'Temilade', 'Temitope', 'Tobiloba', 'Tola', 'Uche', 'Ugochi', 'Urenna', 'Wale', 'Yemi', 'Zainab'],
    surnames: ['Abubakar', 'Adeleke', 'Adewale', 'Adeyemi', 'Agboola', 'Akinwande', 'Amadi', 'Bello', 'Eze', 'Igwe', 'Iwuji', 'Kalu', 'Lawal', 'Mohammad', 'Mustapha', 'Nwachukwu', 'Nwosu', 'Obi', 'Odukoya', 'Ogunleye', 'Okafor', 'Okeke', 'Okonkwo', 'Olawale', 'Oyelaran', 'Salami', 'Sanusi', 'Taiwo', 'Umar', 'Yakubu', 'Yusuf', 'Zubairu'],
  },
  {
    id: 'india',
    weight: 220,
    given: ['Aarav', 'Aarohi', 'Aditi', 'Akash', 'Ananya', 'Anika', 'Ankit', 'Anusha', 'Arav', 'Arjun', 'Arnav', 'Aryan', 'Avni', 'Chandana', 'Dev', 'Deva', 'Dhruv', 'Diya', 'Esha', 'Farhan', 'Faiza', 'Gauri', 'Ishaan', 'Karan', 'Kavya', 'Kiran', 'Krish', 'Kriti', 'Lakshmi', 'Manish', 'Meera', 'Mohit', 'Neha', 'Nisha', 'Om', 'Parvati', 'Pooja', 'Pranav', 'Priya', 'Rahul', 'Rajesh', 'Riya', 'Rohan', 'Rupal', 'Sahil', 'Samira', 'Sanjay', 'Simran', 'Sneha', 'Sonia', 'Suresh', 'Tanvi', 'Tarun', 'Vivaan', 'Vikram', 'Yash'],
    surnames: ['Agarwal', 'Bhatt', 'Chawla', 'Desai', 'Dutta', 'Gupta', 'Iyer', 'Jain', 'Joshi', 'Kapoor', 'Kulkarni', 'Kumar', 'Malhotra', 'Mehta', 'Menon', 'Mishra', 'Nair', 'Nanda', 'Patel', 'Prasad', 'Rao', 'Reddy', 'Roy', 'Saxena', 'Shah', 'Sharma', 'Singh', 'Sinha', 'Srivastava', 'Subramanian', 'Thakur', 'Varma'],
  },
  {
    id: 'kenya',
    weight: 140,
    given: ['Achieng', 'Adoyo', 'Akinyi', 'Amondi', 'Baraka', 'Biko', 'Chebet', 'Chemutai', 'Chepkemoi', 'Chepngetich', 'Gathoni', 'Gikonyo', 'Juma', 'Kamau', 'Karanja', 'Kariuki', 'Kibet', 'Kipchoge', 'Kiprop', 'Lidonde', 'Makena', 'Moraa', 'Mugure', 'Muthoni', 'Mwende', 'Nduta', 'Nekesa', 'Njeri', 'Njoki', 'Njoroge', 'Nyambura', 'Nyawira', 'Odongo', 'Wairimu', 'Wambui', 'Wangari', 'Wanjiru', 'Wafula', 'Wekesa'],
    surnames: ['Auma', 'Chepkwony', 'Gachagua', 'Gathura', 'Kamande', 'Kamunya', 'Kiplagat', 'Kipkorir', 'Kiptoo', 'Koech', 'Komen', 'Langat', 'Maathai', 'Mathenge', 'Mburu', 'Mwangi', 'Mwanzia', 'Ndegwa', 'Ngatia', 'Njenga', 'Njuguna', 'Okoth', 'Ondiek', 'Omondi', 'Otieno', 'Ochieng', 'Sang', 'Tanui', 'Waithaka', 'Wamalwa'],
  },
  {
    id: 'ghana',
    weight: 110,
    given: ['Abena', 'Abia', 'Abrewa', 'Adjoa', 'Adwoa', 'Afia', 'Akosua', 'Akua', 'Amma', 'Aseye', 'Baaba', 'Dela', 'Ebo', 'Effua', 'Elikem', 'Esi', 'Fafali', 'Fiifi', 'Fosua', 'Gameli', 'Kojo', 'Kwabena', 'Kwadwo', 'Kwame', 'Kwamena', 'Kofi', 'Kwasi', 'Maame', 'Nana', 'Nii', 'Selorm', 'Sena', 'Senam', 'Yaw', 'Yawo', 'Yoofi'],
    surnames: ['Aboagye', 'Adjei', 'Adu', 'Agyeman', 'Amankwah', 'Amanfo', 'Ankrah', 'Antwi', 'Appiah', 'Asante', 'Awuku', 'Boateng', 'Danso', 'Edu', 'Frimpong', 'Kwarteng', 'Mensah', 'Obeng', 'Ofosu', 'Ofori', 'Okine', 'Opoku', 'Owusu', 'Quaye', 'Sarpong', 'Tetteh', 'Twumasi', 'Yeboah'],
  },
  {
    id: 'brazil',
    weight: 180,
    given: ['Alice', 'Ana', 'Beatriz', 'Breno', 'Bruna', 'Camila', 'Carla', 'Carine', 'Cauã', 'Davi', 'Daniela', 'Eduardo', 'Elisa', 'Enzo', 'Fernanda', 'Gustavo', 'Henrique', 'Igor', 'Isabela', 'Jaqueline', 'João', 'Júlia', 'Kaio', 'Lara', 'Larissa', 'Letícia', 'Luana', 'Marcela', 'Matheus', 'Nathalia', 'Nicolas', 'Otávio', 'Patrícia', 'Paula', 'Pedro', 'Rafael', 'Raissa', 'Renata', 'Ricardo', 'Roberto', 'Rodrigo', 'Sandro', 'Thalita', 'Thiago', 'Vinicius', 'Vitor', 'Yasmin'],
    surnames: ['Almeida', 'Andrade', 'Araújo', 'Barbosa', 'Cardoso', 'Carvalho', 'Castro', 'Costa', 'Dias', 'Duarte', 'Farias', 'Fernandes', 'Ferreira', 'Freitas', 'Gomes', 'Gonçalves', 'Lima', 'Lopes', 'Machado', 'Martins', 'Mendes', 'Monteiro', 'Moraes', 'Moreira', 'Nascimento', 'Oliveira', 'Pereira', 'Ramos', 'Ribeiro', 'Rocha', 'Rodrigues', 'Santos', 'Silva', 'Sousa', 'Souza', 'Teixeira', 'Vieira'],
  },
  {
    id: 'mexico',
    weight: 120,
    given: ['Adriana', 'Alejandra', 'Alejandro', 'Álvaro', 'Ana', 'Ángela', 'Braulio', 'Celeste', 'Cristina', 'Diana', 'Diego', 'Dolores', 'Elena', 'Emilia', 'Frida', 'Guadalupe', 'Héctor', 'Ignacio', 'Iván', 'Jacinta', 'Jorge', 'José', 'Juan', 'Lucía', 'Luis', 'Manuel', 'Mariana', 'Mateo', 'Miguel', 'Olga', 'Pamela', 'Raúl', 'Rodolfo', 'Rubén', 'Salvador', 'Sofía', 'Susana', 'Valentina', 'Ximena', 'Zoe'],
    surnames: ['Acosta', 'Aguilar', 'Alvarado', 'Amezcua', 'Bautista', 'Cabrera', 'Castillo', 'Chávez', 'Contreras', 'Corona', 'Cortés', 'Cruz', 'Domínguez', 'Esquivel', 'Flores', 'Fuentes', 'García', 'Guerrero', 'Gutiérrez', 'Herrera', 'Jiménez', 'Lara', 'Luna', 'Medina', 'Miranda', 'Molina', 'Morales', 'Moreno', 'Muñoz', 'Navarro', 'Núñez', 'Ortega', 'Peña', 'Pérez', 'Quintero', 'Ramírez', 'Reyes', 'Ríos', 'Romero', 'Salas', 'Salazar', 'Sánchez', 'Santana', 'Vega', 'Villegas', 'Zavala'],
  },
  {
    id: 'southafrica',
    weight: 60,
    given: ['Ayanda', 'Bandile', 'Bongani', 'Bongiwe', 'Buhle', 'Dumisani', 'Gugu', 'Hlengiwe', 'Katleho', 'Khanya', 'Lerato', 'Lindiwe', 'Lwazi', 'Mandla', 'Mbali', 'Mbalenhle', 'Mpho', 'Naledi', 'Nandi', 'Nkosana', 'Nolwazi', 'Ntombi', 'Phumzile', 'Sanele', 'Sibusiso', 'Siphokazi', 'Siya', 'Sizwe', 'Thabo', 'Thandiwe', 'Thando', 'Themba', 'Thulani', 'Tshepo', 'Zanele', 'Zola'],
    surnames: ['Bhengu', 'Botha', 'Dlamini', 'Fourie', 'Khumalo', 'Mahlangu', 'Mkhize', 'Mokoena', 'Molefe', 'Mthembu', 'Naidoo', 'Ndlovu', 'Ngcobo', 'Nkosi', 'Ntshangase', 'Nxumalo', 'Petersen', 'Potgieter', 'Pretorius', 'Sibisi', 'Sithole', 'van der Merwe', 'van Wyk', 'Zulu'],
  },
  {
    id: 'latam',
    weight: 60,
    given: ['Agustín', 'Antonella', 'Baltazar', 'Bianca', 'Camilo', 'Catalina', 'Esteban', 'Facundo', 'Felipe', 'Florencia', 'Gonzalo', 'Isabel', 'Javier', 'Jerónimo', 'Joaquín', 'Julieta', 'Lautaro', 'Luz', 'Malena', 'Marisol', 'Martina', 'Matías', 'Nicolás', 'Paloma', 'Paulina', 'Sabina', 'Santiago', 'Sebastián', 'Valentin', 'Valeria'],
    surnames: ['Aguero', 'Álvarez', 'Arango', 'Bermúdez', 'Bianchi', 'Botero', 'Cárdenas', 'Cepeda', 'Collazos', 'Cuellar', 'Delgado', 'Duque', 'Escobar', 'Espinoza', 'Galindo', 'Giraldo', 'Guzmán', 'Higuera', 'Lozano', 'Maldonado', 'Mendoza', 'Montero', 'Montes', 'Ospina', 'Rendón', 'Restrepo', 'Sanabria', 'Suárez', 'Uribe', 'Vargas', 'Velásquez', 'Zapata', 'Zuluaga'],
  },
  {
    id: 'philippines',
    weight: 110,
    given: ['Althea', 'Alyssa', 'Andrei', 'Angelo', 'Arianne', 'Bea', 'Bianca', 'Carmela', 'Cielo', 'Clarissa', 'Daryl', 'Erika', 'Ezekiel', 'Gio', 'Gian', 'Ina', 'Jade', 'Jana', 'Janina', 'Krystal', 'Liza', 'Mica', 'Mikayla', 'Nadine', 'Neva', 'Paolo', 'Rafaela', 'Roxanne', 'Rubi', 'Sasha', 'Sophia', 'Terrence', 'Trisha', 'Yan', 'Yna'],
    surnames: ['Abella', 'Advincula', 'Agbayani', 'Alcantara', 'Aquino', 'Aragon', 'Ballesteros', 'Bascos', 'Bayani', 'Cariño', 'Casilag', 'Catahan', 'Domingo', 'Escueta', 'Estrada', 'Fabella', 'Feliciano', 'Galang', 'Ganaden', 'Hernando', 'Lauron', 'Ligaya', 'Mallari', 'Manalo', 'Ocampo', 'Pagdanganan', 'Pascual', 'Quinto', 'Real', 'Sotto'],
  },
  {
    id: 'vietnam',
    weight: 90,
    given: ['Anh', 'Bảo', 'Bình', 'Cẩm', 'Chi', 'Dũng', 'Gia', 'Hà', 'Hạnh', 'Hiếu', 'Hoa', 'Hoàng', 'Huy', 'Hương', 'Lan', 'Linh', 'Long', 'Mạnh', 'Minh', 'Nam', 'Ngọc', 'Phương', 'Quân', 'Quang', 'Sơn', 'Thanh', 'Thảo', 'Thi', 'Thu', 'Trang', 'Trí', 'Tú', 'Vân', 'Việt'],
    surnames: ['Bùi', 'Cao', 'Đặng', 'Đỗ', 'Đoàn', 'Đinh', 'Dương', 'Hà', 'Hoàng', 'Lê', 'Lý', 'Mai', 'Ngô', 'Nguyễn', 'Phạm', 'Phan', 'Quách', 'Tạ', 'Trần', 'Võ', 'Vũ', 'Vương'],
  },
  {
    id: 'china',
    weight: 90,
    given: ['Ailin', 'Bailu', 'Chenxi', 'Danhua', 'Fangfang', 'Feiyan', 'Huifang', 'Huiling', 'Jingwen', 'Junhao', 'Kaidi', 'Lijun', 'Liwei', 'Meiyi', 'Mingyu', 'Ping', 'Qiang', 'Ruilin', 'Simin', 'Tingting', 'Wei', 'Xiang', 'Xinyi', 'Yaling', 'Yan', 'Yiming', 'Zhiyuan', 'Zihan', 'Ziwei', 'Ziyang'],
    surnames: ['Bai', 'Bao', 'Chen', 'Deng', 'Fang', 'Feng', 'Gao', 'Gong', 'Guo', 'Han', 'He', 'Huang', 'Jiang', 'Jin', 'Li', 'Liang', 'Lin', 'Liu', 'Lu', 'Luo', 'Ma', 'Meng', 'Mo', 'Sun', 'Tang', 'Tao', 'Wang', 'Wu', 'Xu', 'Yang', 'Ye', 'Yu', 'Zeng', 'Zhang', 'Zhao', 'Zheng', 'Zhou', 'Zhu'],
  },
  {
    id: 'japan',
    weight: 70,
    given: ['Aiko', 'Akari', 'Ami', 'Aoi', 'Ayaka', 'Chinatsu', 'Daiki', 'Eri', 'Fumiko', 'Haru', 'Haruka', 'Hikaru', 'Honoka', 'Isamu', 'Kaito', 'Kaori', 'Kasumi', 'Kenji', 'Kenta', 'Kōki', 'Kotone', 'Mio', 'Mizuki', 'Natsuki', 'Nozomi', 'Ren', 'Riko', 'Riku', 'Rin', 'Ryo', 'Sakura', 'Sora', 'Takumi', 'Takuya', 'Yui', 'Yuki', 'Yuto'],
    surnames: ['Abe', 'Aoki', 'Endo', 'Fujii', 'Fujimoto', 'Goto', 'Harada', 'Hayashi', 'Hirano', 'Ito', 'Kato', 'Kikuchi', 'Kimura', 'Kobayashi', 'Kojima', 'Maeda', 'Matsuda', 'Matsumoto', 'Matsuo', 'Mori', 'Morita', 'Murakami', 'Nakagawa', 'Nakajima', 'Nakamura', 'Nakano', 'Okada', 'Okamoto', 'Ono', 'Ota', 'Saito', 'Sato', 'Sawada', 'Seki', 'Shimizu', 'Suzuki', 'Takada', 'Takahashi', 'Tanaka', 'Taniguchi', 'Tsuchiya', 'Ueda', 'Wada', 'Watanabe', 'Yamada', 'Yamaguchi', 'Yamashita', 'Yano', 'Yoshida', 'Yoshikawa'],
  },
  {
    id: 'korea',
    weight: 70,
    given: ['Areum', 'Boram', 'Chanwoo', 'Dohyun', 'Eunji', 'Eunseo', 'Haena', 'Hana', 'Harin', 'Heejin', 'Hyejin', 'Hyunmin', 'Jaewon', 'Jihye', 'Jiho', 'Jisoo', 'Joon', 'Junseo', 'Minjun', 'Minseo', 'Nari', 'Seojin', 'Seoyeon', 'Sunwoo', 'Taehyun', 'Taeyang', 'Wooyoung', 'Yeji', 'Yoona', 'Yuna'],
    surnames: ['Baek', 'Boo', 'Cha', 'Cho', 'Choi', 'Han', 'Heo', 'Hong', 'Hwang', 'Im', 'Jang', 'Jeon', 'Jeong', 'Ji', 'Jin', 'Jo', 'Kang', 'Kim', 'Ko', 'Kwon', 'Lee', 'Lim', 'Moon', 'Na', 'Nam', 'Oh', 'Park', 'Pyo', 'Seo', 'Shin', 'Sim', 'Son', 'Song', 'Seong', 'Yang', 'Yoo', 'Yoon', 'Yun'],
  },
  {
    id: 'indonesia',
    weight: 60,
    given: ['Agus', 'Andi', 'Aulia', 'Bagas', 'Bima', 'Citra', 'Dewi', 'Diah', 'Dimas', 'Eka', 'Fajar', 'Fitri', 'Galih', 'Hendra', 'Intan', 'Joko', 'Kartika', 'Kirana', 'Melati', 'Nadira', 'Putra', 'Putri', 'Raka', 'Rani', 'Rina', 'Sinta', 'Siti', 'Surya', 'Tari', 'Teguh', 'Tri', 'Wahyu', 'Wulan', 'Yanti', 'Yuda'],
    surnames: ['Alamsyah', 'Anggara', 'Arifin', 'Cahyono', 'Dewantara', 'Ginanjar', 'Handoko', 'Hartono', 'Hidayat', 'Iskandar', 'Kurniawan', 'Kusuma', 'Lestari', 'Mahendra', 'Mulyadi', 'Nugroho', 'Pambudi', 'Prasetyo', 'Prayitno', 'Raharjo', 'Santoso', 'Saputra', 'Sari', 'Setiawan', 'Sugiarto', 'Suryadi', 'Susanto', 'Utami', 'Utomo', 'Wibowo', 'Wijaya', 'Winata', 'Yulianto'],
  },
  {
    id: 'germany',
    weight: 40,
    given: ['Annika', 'Anton', 'Carla', 'Caroline', 'Claudia', 'Dennis', 'Emmi', 'Erik', 'Finn', 'Frieda', 'Günther', 'Hanna', 'Heiko', 'Helena', 'Inga', 'Johanna', 'Jonas', 'Jürgen', 'Karin', 'Katrin', 'Lena', 'Leon', 'Lina', 'Lukas', 'Mara', 'Nadja', 'Niklas', 'Nina', 'Ottilie', 'Petra', 'Sigrid', 'Susanne', 'Tanja'],
    surnames: ['Albrecht', 'Bach', 'Brandt', 'Braun', 'Busch', 'Dietrich', 'Engel', 'Fischer', 'Fuchs', 'Hahn', 'Hartmann', 'Hoffmann', 'Jäger', 'Kaiser', 'Koch', 'Krause', 'Krüger', 'Lange', 'Lehmann', 'Ludwig', 'Maier', 'Meier', 'Müller', 'Neumann', 'Peters', 'Richter', 'Ritter', 'Roth', 'Schulz', 'Schmitt', 'Schneider', 'Scholz', 'Schröder', 'Schubert', 'Schulze', 'Stein', 'Vogel', 'Wagner', 'Weber', 'Wolf', 'Zimmermann'],
  },
  {
    id: 'france',
    weight: 40,
    given: ['Adèle', 'Amandine', 'Anaïs', 'Antoine', 'Aurélie', 'Bastien', 'Béatrice', 'Camille', 'Céline', 'Chloé', 'Clément', 'Élodie', 'Émile', 'Fabien', 'Fleur', 'Hélène', 'Hugo', 'Jean', 'Juliette', 'Laurent', 'Léa', 'Louisa', 'Margaux', 'Marion', 'Mathilde', 'Maxime', 'Nadège', 'Olivier', 'Pauline', 'Raphaël', 'Rémi', 'Sabine', 'Sébastien', 'Solène', 'Théo', 'Valentine', 'Victoire', 'Yann'],
    surnames: ['Aubert', 'Barbier', 'Bernard', 'Bertrand', 'Blanc', 'Bourgeois', 'Brun', 'Caron', 'Chevalier', 'Colin', 'Delacroix', 'Denis', 'Dubois', 'Dupont', 'Durand', 'Fabre', 'Faure', 'Fontaine', 'Fournier', 'Garnier', 'Girard', 'Guerin', 'Henry', 'Lemaire', 'Leroy', 'Martin', 'Mercier', 'Michel', 'Moreau', 'Morin', 'Rivière', 'Robert', 'Rousseau', 'Vasseur', 'Vincent'],
  },
  {
    id: 'italy',
    weight: 30,
    given: ['Alessandra', 'Alessandro', 'Antonio', 'Carlo', 'Caterina', 'Chiara', 'Davide', 'Emilio', 'Enrico', 'Fabio', 'Federica', 'Francesca', 'Francesco', 'Gabriele', 'Giulia', 'Giulio', 'Laura', 'Leonardo', 'Lorenzo', 'Lucia', 'Ludovica', 'Marco', 'Margherita', 'Maria', 'Massimo', 'Matteo', 'Michela', 'Nicola', 'Paolo', 'Riccardo', 'Silvia', 'Simona', 'Sofia', 'Veronica', 'Vittoria'],
    surnames: ['Barbieri', 'Bellini', 'Bernardi', 'Bianco', 'Caputo', 'Caruso', 'Colombo', 'Conti', 'De Luca', 'De Santis', 'Esposito', 'Farina', 'Ferrari', 'Ferretti', 'Fiore', 'Fontana', 'Gallo', 'Gatti', 'Greco', 'Guerra', 'Lombardi', 'Marchetti', 'Marino', 'Martino', 'Monti', 'Moretti', 'Negri', 'Orlando', 'Palumbo', 'Pellegrini', 'Ricci', 'Rinaldi', 'Romano', 'Rossi', 'Russo', 'Sartori', 'Serra', 'Testa', 'Villa'],
  },
]