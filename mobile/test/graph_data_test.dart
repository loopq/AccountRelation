import 'package:flutter_test/flutter_test.dart';
import 'package:account_graph/data/models/account.dart';
import 'package:account_graph/state/data_provider.dart';

void main() {
  final email = Account(id: 'e1', category: 'email', name: 'a@gmail.com');
  final apple = Account(id: 'p1', category: 'apple', name: 'Apple-A', registerEmailId: 'e1');
  final ai = Account(id: 'i1', category: 'ai', name: 'GPT', registerEmailId: 'e1');
  final orphan = Account(id: 'i2', category: 'ai', name: 'GPT2');
  final d = GraphData([email, apple, ai, orphan], [], []);

  test('emailOf: email 取自身', () => expect(d.emailOf(email), 'a@gmail.com'));
  test('emailOf: apple 取注册邮箱', () => expect(d.emailOf(apple), 'a@gmail.com'));
  test('emailOf: ai 取注册邮箱', () => expect(d.emailOf(ai), 'a@gmail.com'));
  test('emailOf: 无关联返回 null', () => expect(d.emailOf(orphan), null));
}
