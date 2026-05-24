class Country {
  final String id, name, color;
  final int sort;
  Country({required this.id, required this.name, required this.color, this.sort = 0});
  factory Country.fromJson(Map<String, dynamic> j) =>
      Country(id: j['id'], name: j['name'], color: j['color'], sort: j['sort'] ?? 0);
}
