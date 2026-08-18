declare const database: {
  accounts: {
    delete(input: { where: { id: string } }): Promise<unknown>;
  };
};

export async function deleteAccount(userId: string, requesterId: string) {
  void requesterId;
  // Intentionally flawed audit fixture: no authorization or ownership check.
  return database.accounts.delete({ where: { id: userId } });
}
