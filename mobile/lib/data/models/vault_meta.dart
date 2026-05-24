class VaultMeta {
  final String salt, canary;
  VaultMeta({required this.salt, required this.canary});
  factory VaultMeta.fromJson(Map<String, dynamic> j) => VaultMeta(salt: j['salt'], canary: j['canary']);
}
