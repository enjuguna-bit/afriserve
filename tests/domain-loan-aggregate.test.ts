import test from "node:test";
import assert from "node:assert/strict";
import { Loan } from "../src/domain/loan/entities/Loan.js";
import { Disbursement } from "../src/domain/loan/entities/Disbursement.js";
import { Repayment } from "../src/domain/loan/entities/Repayment.js";
import { Money } from "../src/domain/shared/value-objects/Money.js";
import { LoanId } from "../src/domain/loan/value-objects/LoanId.js";
import { LoanStatus } from "../src/domain/loan/value-objects/LoanStatus.js";
import { InterestRate } from "../src/domain/loan/value-objects/InterestRate.js";
import { LoanTerm } from "../src/domain/loan/value-objects/LoanTerm.js";

function makeLoan(o: Record<string,any> = {}) {
  return Loan.createApplication({
    id: o.id ?? 1, clientId: o.clientId ?? 10, branchId: o.branchId ?? 5,
    createdByUserId: 99, officerId: null,
    principal: o.principal ?? Money.fromNumber(1000),
    interestRate: InterestRate.fromPercentage(10),
    term: o.term ?? LoanTerm.fromWeeks(4),
    registrationFee: Money.fromNumber(50), processingFee: Money.fromNumber(50),
    expectedTotal: o.expectedTotal ?? Money.fromNumber(1200),
  });
}

test("createApplication sets status to pending_approval", () => { assert.ok(makeLoan().status.isPendingApproval()); });
test("createApplication balance equals expectedTotal", () => { assert.equal(makeLoan({expectedTotal:Money.fromNumber(1200)}).balance.amount, 1200); });
test("createApplication repaidTotal is zero", () => { assert.equal(makeLoan().repaidTotal.amount, 0); });
test("createApplication emits LoanApplicationSubmitted", () => { const e = makeLoan().getUncommittedEvents(); assert.equal(e.length,1); assert.equal(e[0].eventType,"loan.application.submitted"); });
test("clearEvents empties list", () => { const l = makeLoan(); l.clearEvents(); assert.equal(l.getUncommittedEvents().length,0); });
test("canBeApproved true for pending_approval", () => { assert.ok(makeLoan().canBeApproved()); });
test("canBeApproved false after approval", () => { const l=makeLoan(); l.approve(1); assert.ok(!l.canBeApproved()); });
test("canBeDisbursed false for pending_approval", () => { assert.ok(!makeLoan().canBeDisbursed()); });
test("canBeDisbursed true after approval", () => { const l=makeLoan(); l.approve(1); assert.ok(l.canBeDisbursed()); });
test("canAcceptRepayment false before disburse", () => { const l=makeLoan(); l.approve(1); assert.ok(!l.canAcceptRepayment()); });
test("canAcceptRepayment true after disburse", () => { const l=makeLoan(); l.approve(1); l.disburse({disbursedByUserId:1}); assert.ok(l.canAcceptRepayment()); });
test("approve sets approved status", () => { const l=makeLoan(); l.approve(5); assert.ok(l.status.isApproved()); });
test("approve sets approvedAt", () => { const l=makeLoan(); const b=new Date(); l.approve(5); assert.ok(l.approvedAt!==null && l.approvedAt>=b); });
test("approve emits LoanApproved", () => { const l=makeLoan(); l.clearEvents(); l.approve(5); assert.equal(l.getUncommittedEvents()[0].eventType,"loan.approved"); });
test("approve on non-pending throws", () => { const l=makeLoan(); l.approve(1); assert.throws(()=>l.approve(1),/Cannot approve/i); });
test("reject sets rejected status", () => { const l=makeLoan(); l.reject(2,"reason"); assert.ok(l.status.isRejected()); });
test("reject sets rejectionReason", () => { const l=makeLoan(); l.reject(2,"bad risk"); assert.equal(l.rejectionReason,"bad risk"); });
test("reject on approved throws", () => { const l=makeLoan(); l.approve(1); assert.throws(()=>l.reject(2,"x"),/Cannot reject/i); });
test("disburse transitions to active", () => { const l=makeLoan(); l.approve(1); l.disburse({disbursedByUserId:2}); assert.ok(l.status.isActive()); });
test("disburse sets disbursedAt", () => { const l=makeLoan(); l.approve(1); const b=new Date(); l.disburse({disbursedByUserId:2}); assert.ok(l.disbursedAt!==null && l.disbursedAt>=b); });
test("disburse emits LoanDisbursed with isTranche=false", () => { const l=makeLoan(); l.approve(1); l.clearEvents(); l.disburse({disbursedByUserId:2,externalReference:"EXT-1"}); const ev=l.getUncommittedEvents()[0] as any; assert.equal(ev.isTranche,false); assert.equal(ev.externalReference,"EXT-1"); });
test("disburse on non-approved throws", () => { assert.throws(()=>makeLoan().disburse({disbursedByUserId:1}),/Cannot disburse/i); });
test("disburseTranche non-final keeps approved status", () => { const l=makeLoan(); l.approve(1); l.disburseTranche({disbursedByUserId:1,trancheNumber:1,trancheAmount:500,isFinal:false}); assert.ok(l.status.isApproved()); });
test("disburseTranche final transitions to active", () => { const l=makeLoan(); l.approve(1); l.disburseTranche({disbursedByUserId:1,trancheNumber:1,trancheAmount:500,isFinal:false}); l.disburseTranche({disbursedByUserId:1,trancheNumber:2,trancheAmount:500,isFinal:true}); assert.ok(l.status.isActive()); });
test("disburseTranche emits isTranche=true for non-final", () => { const l=makeLoan(); l.approve(1); l.clearEvents(); l.disburseTranche({disbursedByUserId:1,trancheNumber:2,trancheAmount:400,isFinal:false}); const ev=l.getUncommittedEvents()[0] as any; assert.equal(ev.isTranche,true); assert.equal(ev.trancheNumber,2); });
test("recordRepayment reduces balance", () => { const l=makeLoan({expectedTotal:Money.fromNumber(1200)}); l.approve(1); l.disburse({disbursedByUserId:1}); l.recordRepayment({amount:Money.fromNumber(300),recordedByUserId:1}); assert.equal(l.balance.amount,900); });
test("recordRepayment increases repaidTotal", () => { const l=makeLoan({expectedTotal:Money.fromNumber(1200)}); l.approve(1); l.disburse({disbursedByUserId:1}); l.recordRepayment({amount:Money.fromNumber(300),recordedByUserId:1}); assert.equal(l.repaidTotal.amount,300); });
test("recordRepayment closes loan on full payment", () => { const l=makeLoan({expectedTotal:Money.fromNumber(1200)}); l.approve(1); l.disburse({disbursedByUserId:1}); l.recordRepayment({amount:Money.fromNumber(1200),recordedByUserId:1}); assert.ok(l.status.isClosed()); assert.ok(l.isFullyRepaid()); });
test("recordRepayment clamps balance to zero on overpayment", () => { const l=makeLoan({expectedTotal:Money.fromNumber(1000)}); l.approve(1); l.disburse({disbursedByUserId:1}); l.recordRepayment({amount:Money.fromNumber(5000),recordedByUserId:1}); assert.equal(l.balance.amount,0); });
test("recordRepayment emits RepaymentRecorded", () => { const l=makeLoan({expectedTotal:Money.fromNumber(1200)}); l.approve(1); l.disburse({disbursedByUserId:1}); l.clearEvents(); l.recordRepayment({amount:Money.fromNumber(300),recordedByUserId:2}); assert.equal(l.getUncommittedEvents()[0].eventType,"loan.repayment.recorded"); });
test("RepaymentRecorded marks isFullyRepaid when balance=0", () => { const l=makeLoan({expectedTotal:Money.fromNumber(500)}); l.approve(1); l.disburse({disbursedByUserId:1}); l.clearEvents(); l.recordRepayment({amount:Money.fromNumber(500),recordedByUserId:1}); const ev=l.getUncommittedEvents()[0] as any; assert.equal(ev.isFullyRepaid,true); assert.equal(ev.remainingBalance,0); });
test("recordRepayment throws on zero amount", () => { const l=makeLoan(); l.approve(1); l.disburse({disbursedByUserId:1}); assert.throws(()=>l.recordRepayment({amount:Money.zero(),recordedByUserId:1}),/positive/i); });
test("recordRepayment throws when not disbursed", () => { const l=makeLoan(); l.approve(1); assert.throws(()=>l.recordRepayment({amount:Money.fromNumber(100),recordedByUserId:1}),/Cannot record/i); });
test("multiple repayments accumulate correctly", () => { const l=makeLoan({expectedTotal:Money.fromNumber(1200)}); l.approve(1); l.disburse({disbursedByUserId:1}); l.recordRepayment({amount:Money.fromNumber(300),recordedByUserId:1}); l.recordRepayment({amount:Money.fromNumber(300),recordedByUserId:1}); assert.equal(l.repaidTotal.amount,600); assert.equal(l.balance.amount,600); assert.ok(!l.status.isClosed()); });
test("toPersistence maps status as string", () => { assert.equal(makeLoan().toPersistence()["status"],"pending_approval"); });
test("toPersistence maps principal", () => { assert.equal(makeLoan({principal:Money.fromNumber(5000)}).toPersistence()["principal"],5000); });
test("toPersistence maps null dates as null", () => { const p=makeLoan().toPersistence(); assert.equal(p["approved_at"],null); assert.equal(p["disbursed_at"],null); });
test("Loan.reconstitute emits no events", () => { const props={id:LoanId.fromNumber(1),clientId:1,productId:null,branchId:1,createdByUserId:1,officerId:null,principal:Money.fromNumber(1000),interestRate:InterestRate.fromPercentage(10),term:LoanTerm.fromWeeks(4),registrationFee:Money.zero(),processingFee:Money.zero(),expectedTotal:Money.fromNumber(1100),balance:Money.fromNumber(1100),repaidTotal:Money.zero(),status:LoanStatus.active(),approvedByUserId:1,approvedAt:new Date(),disbursedByUserId:1,disbursedAt:new Date(),disbursementNote:null,externalReference:null,rejectedByUserId:null,rejectedAt:null,rejectionReason:null,archivedAt:null,createdAt:new Date()}; const l=Loan.reconstitute(props); assert.equal(l.getUncommittedEvents().length,0); assert.ok(l.status.isActive()); });
test("Disbursement.create has null id", () => { const d=Disbursement.create({loanId:1,trancheNumber:1,amount:Money.fromNumber(500),disbursedAt:new Date(),disbursedByUserId:1,note:null,isFinal:true}); assert.equal(d.id,null); });
test("Disbursement toPersistence maps is_final as integer", () => { const d=Disbursement.create({loanId:1,trancheNumber:1,amount:Money.fromNumber(500),disbursedAt:new Date(),disbursedByUserId:1,note:null,isFinal:false}); assert.equal(d.toPersistence()["is_final"],0); });
test("Repayment.create has null id", () => { const r=Repayment.create({loanId:1,clientId:10,amount:Money.fromNumber(300),paidAt:new Date(),recordedByUserId:1,note:null,externalReference:null,paymentMethod:"cash"}); assert.equal(r.id,null); assert.equal(r.amount.amount,300); });