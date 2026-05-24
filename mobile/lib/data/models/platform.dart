class Platform {
  final String id, category, name;
  final String? color;
  final int sort;
  Platform({required this.id, required this.category, required this.name, this.color, this.sort = 0});
  factory Platform.fromJson(Map<String, dynamic> j) =>
      Platform(id: j['id'], category: j['category'], name: j['name'], color: j['color'], sort: j['sort'] ?? 0);
}
