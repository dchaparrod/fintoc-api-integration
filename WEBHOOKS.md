# Webhooks — Pending Consideration

This section is reserved for future webhook integration with Fintoc.

## Events to Handle

| Event | Description |
|---|---|
| `transfer.outbound.succeeded` | Sent when the transfer is sent successfully |
| `transfer.outbound.rejected` | Sent when the counterparty institution has rejected the transfer (final state) |
| `transfer.outbound.failed` | Sent when the transfer has not been able to reach its destination account |

## Implementation Notes

- Webhooks may arrive in disorder — handle idempotently
- Use the `idempotency_key` stored in the `transactions` table to correlate webhook events
- Update transaction status in the database upon receiving webhook events
- Consider sending notification emails or logging to ERP upon `succeeded` events

## References

- [Fintoc Webhook Guide](https://docs.fintoc.com/docs/webhooks-walkthrough)
- [Transfer Status Flow](https://docs.fintoc.com/docs/v2-transfers-data-model)
